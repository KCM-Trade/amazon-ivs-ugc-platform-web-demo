import { FastifyReply, FastifyRequest } from 'fastify';

import {
  CHANNELS_TABLE_STAGE_FIELDS,
  STAGE_END_EXCEPTION
} from '../../shared/constants';
import { verifyUserIsStageHost } from '../helpers';
import { getUser } from '../../channel/helpers';
import { dynamoDbClient, updateDynamoItemAttributes } from '../../shared/helpers';
import { UserContext } from '../../shared/authorizer';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { convertToAttr, unmarshall } from '@aws-sdk/util-dynamodb';

type DeleteStageRequestBody = {
  deleteStageResource: boolean;
};

const handler = async (
  request: FastifyRequest<{ Body: DeleteStageRequestBody }>,
  reply: FastifyReply
) => {
  try {
    const { sub } = request.requestContext.get('user') as UserContext;
    let stageId;

    try {
      ({ stageId } = await verifyUserIsStageHost(sub));
    } catch (verificationError) {
      console.warn('User is not a stage host:', verificationError);
      reply.statusCode = 200;

      return reply.send({
        message: 'The user is not associated to any stage ID.'
      });
    }

    const { Item: channelItem = {} } = await getUser(sub);
    const { channelArn } = unmarshall(channelItem);

    await updateDynamoItemAttributes({
      attributes: [
        { key: CHANNELS_TABLE_STAGE_FIELDS.STAGE_ID, value: null },
        { key: CHANNELS_TABLE_STAGE_FIELDS.STAGE_CREATION_DATE, value: null }
      ],
      primaryKey: { key: 'id', value: sub },
      tableName: process.env.CHANNELS_TABLE_NAME as string
    });
    console.log(
      "Successfully nullified the stageId attribute from the channel's table."
    );

    if (channelArn && stageId && process.env.STREAM_TABLE_NAME) {
      await dynamoDbClient.send(
        new UpdateItemCommand({
          TableName: process.env.STREAM_TABLE_NAME,
          Key: {
            channelArn: convertToAttr(channelArn),
            id: convertToAttr(stageId)
          },
          UpdateExpression: 'REMOVE isOpen SET endTime = :endTime',
          ExpressionAttributeValues: {
            ':endTime': convertToAttr(new Date().toISOString())
          }
        })
      );
    }

    reply.statusCode = 200;
    return reply.send({
      message: `Stage, with stageId "${stageId}", has been successfully deleted.`
    });
  } catch (error) {
    console.error(error);

    reply.statusCode = 500;
    return reply.send({ __type: STAGE_END_EXCEPTION });
  }
};

export default handler;
