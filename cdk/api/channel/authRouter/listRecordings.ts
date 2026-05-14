import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { convertToAttr, unmarshall } from '@aws-sdk/util-dynamodb';
import { FastifyReply, FastifyRequest } from 'fastify';

import { UserContext } from '../../shared/authorizer';
import { UNEXPECTED_EXCEPTION } from '../../shared/constants';
import { dynamoDbClient } from '../../shared/helpers';
import { getUser } from '../helpers';

const handler = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub } = request.requestContext.get('user') as UserContext;

  try {
    const { Item } = await getUser(sub);
    const channelArn = Item?.channelArn?.S;

    if (!channelArn) {
      return reply.send({ recordings: [] });
    }

    const { Items = [] } = await dynamoDbClient.send(
      new QueryCommand({
        TableName: process.env.STREAM_TABLE_NAME,
        IndexName: 'startTimeIndex',
        KeyConditionExpression: 'channelArn = :c',
        ExpressionAttributeValues: {
          ':c': convertToAttr(channelArn)
        },
        ScanIndexForward: false,
        Limit: 50,
        ProjectionExpression: 'id, #st, endTime, recordingPlaybackUrl',
        ExpressionAttributeNames: {
          '#st': 'startTime'
        }
      })
    );

    const recordings = Items.map((i) => unmarshall(i))
      .filter((row) => !!row.recordingPlaybackUrl)
      .map((row) => ({
        streamId: row.id as string,
        startTime: row.startTime as string | undefined,
        endTime: row.endTime as string | undefined,
        playbackUrl: row.recordingPlaybackUrl as string
      }));

    return reply.send({ recordings });
  } catch (error) {
    console.error(error);

    reply.statusCode = 500;

    return reply.send({ __type: UNEXPECTED_EXCEPTION });
  }
};

export default handler;
