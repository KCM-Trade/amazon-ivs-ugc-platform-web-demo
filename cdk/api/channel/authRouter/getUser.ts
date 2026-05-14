import { FastifyReply, FastifyRequest } from 'fastify';
import { unmarshall } from '@aws-sdk/util-dynamodb';

import { getChannelArnParams, getUser, userChannelNeedsIvSConfigSync } from '../helpers';
import {
  ChannelAssetURLs,
  getChannelAssetUrls,
  getChannelId,
  ResponseBody
} from '../../shared/helpers';
import { UNEXPECTED_EXCEPTION } from '../../shared/constants';
import { UserContext } from '../../shared/authorizer';

interface GetUserResponseBody extends ResponseBody {
  avatar?: string;
  channelAssetUrls?: ChannelAssetURLs;
  channelResourceId?: string;
  color?: string;
  ingestEndpoint?: string;
  ingestServerUrl?: string;
  playbackUrl?: string;
  streamKeyValue?: string;
  username?: string;
  trackingId?: string;
  stageId?: string;
  /** When true, client should call PUT /channel/config/update once to align IVS + Dynamo (recording ARN, presets). */
  needsChannelConfigSync?: boolean;
}

const handler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub } = request.requestContext.get('user') as UserContext;
  const responseBody: GetUserResponseBody = {};

  try {
    // Get user from channelsTable
    const { Item = {} } = await getUser(sub);
    const data = unmarshall(Item);
    let channelId;
    const {
      avatar,
      channelArn,
      channelAssets,
      color,
      ingestEndpoint,
      playbackUrl,
      streamKeyValue,
      username,
      trackingId,
      stageId,
      channelConfiguration,
      recordingConfigurationArn
    } = data;

    if (!channelArn) {
      throw new Error('No IVS resources have been created for this user.');
    }

    if (channelArn) {
      responseBody.channelResourceId =
        getChannelArnParams(channelArn).resourceId;

      channelId = getChannelId(channelArn);
    }
    responseBody.avatar = avatar;
    responseBody.color = color;
    responseBody.ingestEndpoint = ingestEndpoint;
    responseBody.ingestServerUrl = `rtmps://${ingestEndpoint}:443/app/`;
    responseBody.playbackUrl = playbackUrl;
    responseBody.streamKeyValue = streamKeyValue;
    responseBody.username = username;
    responseBody.channelAssetUrls = getChannelAssetUrls(channelAssets);
    responseBody.trackingId = trackingId;
    responseBody.channelId = channelId;
    responseBody.stageId = stageId;
    responseBody.channelConfiguration = channelConfiguration;
    responseBody.needsChannelConfigSync = userChannelNeedsIvSConfigSync({
      channelConfiguration,
      recordingConfigurationArn
    });
  } catch (error) {
    console.error(error);

    reply.statusCode = 500;

    return reply.send({ __type: UNEXPECTED_EXCEPTION });
  }

  return reply.send(responseBody);
};

export default handler;
