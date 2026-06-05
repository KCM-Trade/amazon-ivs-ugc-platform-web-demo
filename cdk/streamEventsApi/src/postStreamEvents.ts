import { S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { FastifyReply, FastifyRequest } from 'fastify';

import {
  IVS_PARTICIPANT_RECORDING_STATE_CHANGE_TYPE,
  IVS_RECORDING_STATE_CHANGE_TYPE,
  LIMIT_BREACH_EVENT_TYPE,
  PARTICIPANT_RECORDING_END,
  SESSION_CREATED,
  SESSION_ENDED,
  STARVATION_START,
  STREAM_END,
  STREAM_HEALTH_CHANGE_EVENT_TYPE,
  UNEXPECTED_EXCEPTION
} from './constants';
import {
  AdditionalStreamAttributes,
  extractStageIdFromStageArn,
  getStreamEvents,
  getStreamSession,
  getStreamsByChannelArn,
  getUserByStageId,
  setOldLiveStreamsOffline,
  StreamEvent,
  updateStreamEvents
} from './helpers';
import { getUserByChannelArn } from './helpers';
import { archiveRecordingPrefix } from './recordingArchive';
import {
  buildCanonicalLowLatencyPrefix,
  buildCanonicalRealTimePrefix,
  buildManifestKey,
  buildPlaybackUrlFromS3Key,
  extractResourceIdFromArn,
  LOW_LATENCY_MANIFEST,
  normalizeKeyPrefix,
  REAL_TIME_MANIFEST,
  resolveLowLatencySessionId,
  resolveRealTimeSessionParts
} from './recordingPaths';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || process.env.REGION
});

const RECORDING_TERMINAL_STATUSES = new Set([
  'Recording End',
  'RECORDING_ENDED',
  'Recording End Failure',
  'RECORDING_ENDED_WITH_FAILURE'
]);

const handler = async (
  request: FastifyRequest<{
    Body: {
      'detail-type': string;
      detail: { event_name: string; limit_name?: string; stream_id?: string };
      time: string;
      resources: string[];
    };
  }>,
  reply: FastifyReply
) => {
  try {
    const {
      detail: { event_name: eventName, limit_name: limitName },
      'detail-type': eventType,
      time: eventTime,
      resources
    } = request.body;

    // Ignore "AWS API Call via CloudTrail" events
    if (eventType === 'AWS API Call via CloudTrail') {
      return;
    }

    console.info('Incoming Event', JSON.stringify(request.body));

    if (eventType === IVS_RECORDING_STATE_CHANGE_TYPE) {
      return handleRecordingStateChange(request, reply);
    }

    if (eventType === IVS_PARTICIPANT_RECORDING_STATE_CHANGE_TYPE) {
      return handleParticipantRecordingStateChange(request, reply);
    }

    let {
      detail: { stream_id: streamId = '' }
    } = request.body;
    const channelArn = resources?.[0];

    if ((!limitName && !eventName) || !eventType || !eventTime || !channelArn) {
      throw new Error('Missing required data for event');
    }

    const { Items } = await getUserByChannelArn(channelArn);
    let userSub;

    if (Items && Items.length > 0) {
      ({ id: userSub } = unmarshall(Items[0]));
    } else {
      throw new Error('User not found');
    }

    if (!userSub) {
      throw new Error('Missing user sub');
    }

    if (!streamId) {
      const { Items: streamSessions = [] } = await getStreamsByChannelArn(
        channelArn
      );
      const streamSession = streamSessions.find((streamSession) => {
        const { startTime } = unmarshall(streamSession);

        return startTime <= eventTime;
      });

      if (!streamSession) {
        throw new Error('Could not match event with a stream session');
      } else {
        streamId = streamSession.id?.S || '';
      }
    }

    const newEvent: StreamEvent = {
      eventTime,
      name: limitName || eventName,
      type: eventType
    };
    const streamEvents = await getStreamEvents(channelArn, streamId);
    streamEvents.push(newEvent);
    const sortedStreamEvents =
      streamEvents.sort(
        ({ eventTime: eventTime1 }, { eventTime: eventTime2 }) => {
          /* istanbul ignore else */
          if (eventTime1 === eventTime2) {
            return 0; // Adding this else case for completeness, but it is extremely unlikely that 2 events have the same timestamp
          } else {
            return eventTime1 > eventTime2 ? 1 : -1; // Ascending order
          }
        }
      ) || [];
    const latestStreamHealthChangeEvent = sortedStreamEvents
      .filter(({ type }) => type === STREAM_HEALTH_CHANGE_EVENT_TYPE)
      .pop();

    const additionalAttributes: AdditionalStreamAttributes = {};
    const attributesToRemove: string[] = [];

    additionalAttributes.isHealthy =
      latestStreamHealthChangeEvent?.name !== STARVATION_START;

    if (eventName === SESSION_CREATED) {
      // Older stream sessions with isOpen set to true will have the isOpen attribute removed
      await setOldLiveStreamsOffline(channelArn);

      additionalAttributes.startTime = eventTime;

      // Handle the case where a SESSION_CREATED event is dispatched after a SESSION_ENDED or STREAM_END event
      if (
        streamEvents.some(
          (streamEvent) =>
            streamEvent.name === SESSION_ENDED ||
            streamEvent.name === STREAM_END
        )
      ) {
        console.log(
          'Session not set to live: a SESSION_ENDED or STREAM_END event was already detected. Stream ID: ',
          streamId
        );
      } else {
        additionalAttributes.hasErrorEvent = false;
        additionalAttributes.isOpen = 'true';
      }
    } else if (eventName === SESSION_ENDED) {
      additionalAttributes.endTime = eventTime;
      attributesToRemove.push('isOpen');
    }
    if (eventType === LIMIT_BREACH_EVENT_TYPE)
      additionalAttributes.hasErrorEvent = true;

    await updateStreamEvents({
      additionalAttributes,
      attributesToRemove,
      channelArn,
      streamEvents,
      streamId,
      userSub
    });
  } catch (error) {
    console.error(error);
    console.error(`Event body: ${JSON.stringify(request.body)}`);

    reply.statusCode = 500;

    return reply.send({ __type: UNEXPECTED_EXCEPTION });
  }

  return reply.send();
};

async function handleRecordingStateChange(
  request: FastifyRequest<{
    Body: {
      'detail-type': string;
      detail: Record<string, unknown>;
      time: string;
      resources: string[];
    };
  }>,
  reply: FastifyReply
) {
  try {
    const channelArn = request.body.resources?.[0];
    const eventTime = request.body.time;

    const detail = request.body.detail || {};
    const recordingStatusRaw = detail.recording_status as string | undefined;
    const recordingBucket = detail.recording_s3_bucket_name as
      | string
      | undefined;
    const keyPrefix = detail.recording_s3_key_prefix as string | undefined;
    const recordingSessionStreamIds = detail.recording_session_stream_ids as
      | string[]
      | undefined;
    const streamIdScalar = detail.stream_id as string | undefined;

    if (!channelArn || !eventTime) {
      throw new Error('Missing channelArn or event time');
    }

    if (
      !recordingStatusRaw ||
      !RECORDING_TERMINAL_STATUSES.has(recordingStatusRaw)
    ) {
      await reply.send();

      return;
    }

    const expectedBucket = process.env.RECORDINGS_BUCKET_NAME;
    if (
      expectedBucket &&
      recordingBucket &&
      recordingBucket !== expectedBucket
    ) {
      console.warn(
        'Recording bucket mismatch',
        recordingBucket,
        expectedBucket
      );
    }

    if (!recordingBucket || !keyPrefix) {
      console.warn('Recording end without S3 location; skipping persist');
      await reply.send();

      return;
    }

    const channelId = extractResourceIdFromArn(channelArn);
    const sessionId = resolveLowLatencySessionId({
      stream_id: streamIdScalar,
      recording_session_id: detail.recording_session_id as string | undefined,
      recording_s3_key_prefix: keyPrefix
    });

    if (!channelId || !sessionId) {
      console.warn('Recording end without channel/session ids; skipping persist');
      await reply.send();

      return;
    }

    const canonicalPrefix = buildCanonicalLowLatencyPrefix(channelId, sessionId);

    await archiveRecordingPrefix({
      client: s3Client,
      bucket: recordingBucket,
      sourcePrefix: keyPrefix,
      destinationPrefix: canonicalPrefix
    });

    const manifestKey = buildManifestKey(canonicalPrefix, LOW_LATENCY_MANIFEST);
    const recordingPlaybackUrl = buildPlaybackUrlFromS3Key(
      recordingBucket,
      process.env.AWS_REGION || process.env.REGION,
      manifestKey
    );

    const streamIds = new Set<string>();
    if (recordingSessionStreamIds?.length) {
      recordingSessionStreamIds.forEach((id) => streamIds.add(id));
    } else if (streamIdScalar) {
      streamIds.add(streamIdScalar);
    }

    if (!streamIds.size) {
      console.warn('Recording end without stream ids; skipping persist');
      await reply.send();

      return;
    }

    const { Items } = await getUserByChannelArn(channelArn);
    let userSub: string | undefined;

    if (Items && Items.length > 0) {
      ({ id: userSub } = unmarshall(Items[0]));
    } else {
      throw new Error('User not found');
    }

    if (!userSub) {
      throw new Error('Missing user sub');
    }

    const newEvent: StreamEvent = {
      eventTime,
      name: recordingStatusRaw,
      type: IVS_RECORDING_STATE_CHANGE_TYPE
    };

    await Promise.all(
      [...streamIds].map(async (streamId) => {
        const streamEvents = await getStreamEvents(channelArn, streamId);
        streamEvents.push(newEvent);
        const sortedStreamEvents =
          streamEvents.sort(
            ({ eventTime: eventTime1 }, { eventTime: eventTime2 }) => {
              if (eventTime1 === eventTime2) {
                return 0;
              }

              return eventTime1 > eventTime2 ? 1 : -1;
            }
          ) || [];

        const additionalAttributes: AdditionalStreamAttributes = {
          recordingPlaybackUrl
        };

        await updateStreamEvents({
          additionalAttributes,
          attributesToRemove: [],
          channelArn,
          streamEvents: sortedStreamEvents,
          streamId,
          userSub: userSub as string
        });
      })
    );
  } catch (error) {
    console.error(error);
    console.error(`Event body: ${JSON.stringify(request.body)}`);

    reply.statusCode = 500;

    return reply.send({ __type: UNEXPECTED_EXCEPTION });
  }

  return reply.send();
}

async function handleParticipantRecordingStateChange(
  request: FastifyRequest<{
    Body: {
      'detail-type': string;
      detail: Record<string, unknown>;
      time: string;
      resources: string[];
    };
  }>,
  reply: FastifyReply
) {
  try {
    const detail = request.body.detail || {};
    const eventName = detail.event_name as string | undefined;
    const stageArn = request.body.resources?.[0];
    const eventTime = request.body.time;

    if (eventName !== PARTICIPANT_RECORDING_END || !stageArn || !eventTime) {
      await reply.send();

      return;
    }

    const recordingBucket =
      (detail.recording_s3_bucket_name as string | undefined) ||
      process.env.RECORDINGS_BUCKET_NAME;
    const keyPrefix = detail.recording_s3_key_prefix as string | undefined;
    const recordingDurationMs = detail.recording_duration_ms as
      | number
      | undefined;

    if (!recordingBucket || !keyPrefix) {
      console.warn('Participant recording end without S3 location; skipping');
      await reply.send();

      return;
    }

    const stageId = extractStageIdFromStageArn(stageArn);
    if (!stageId) {
      throw new Error('Could not parse stage id from stage ARN');
    }

    const { Items = [] } = await getUserByStageId(stageId);
    if (!Items.length) {
      console.warn('No channel owner found for participant recording', stageId);
      await reply.send();

      return;
    }

    const { id: userSub, channelArn } = unmarshall(Items[0]);
    if (!userSub || !channelArn) {
      throw new Error('Missing channelArn or user sub for participant recording');
    }

    const existingSession = await getStreamSession(channelArn, stageId);
    const existingDuration = existingSession.recordingDurationMs as
      | number
      | undefined;

    if (
      typeof existingDuration === 'number' &&
      typeof recordingDurationMs === 'number' &&
      recordingDurationMs <= existingDuration
    ) {
      await reply.send();

      return;
    }

    const { sessionId, participantId } = resolveRealTimeSessionParts(keyPrefix, {
      session_id: detail.session_id as string | undefined,
      participant_id: detail.participant_id as string | undefined
    });

    if (!sessionId || !participantId) {
      console.warn('Participant recording end without session/participant ids; skipping');
      await reply.send();

      return;
    }

    const canonicalPrefix = buildCanonicalRealTimePrefix(
      stageId,
      sessionId,
      participantId
    );

    await archiveRecordingPrefix({
      client: s3Client,
      bucket: recordingBucket,
      sourcePrefix: keyPrefix,
      destinationPrefix: canonicalPrefix
    });

    const manifestKey = buildManifestKey(canonicalPrefix, REAL_TIME_MANIFEST);
    const recordingPlaybackUrl = buildPlaybackUrlFromS3Key(
      recordingBucket,
      process.env.AWS_REGION || process.env.REGION,
      manifestKey
    );

    const streamEvents = await getStreamEvents(channelArn, stageId);
    const newEvent: StreamEvent = {
      eventTime,
      name: eventName,
      type: IVS_PARTICIPANT_RECORDING_STATE_CHANGE_TYPE
    };
    streamEvents.push(newEvent);

    const additionalAttributes: AdditionalStreamAttributes = {
      recordingPlaybackUrl,
      endTime: eventTime
    };
    if (typeof recordingDurationMs === 'number') {
      additionalAttributes.recordingDurationMs = recordingDurationMs;
    }

    await updateStreamEvents({
      additionalAttributes,
      attributesToRemove: ['isOpen'],
      channelArn,
      streamEvents,
      streamId: stageId,
      userSub
    });
  } catch (error) {
    console.error(error);
    console.error(`Event body: ${JSON.stringify(request.body)}`);

    reply.statusCode = 500;

    return reply.send({ __type: UNEXPECTED_EXCEPTION });
  }

  return reply.send();
}

export default handler;
