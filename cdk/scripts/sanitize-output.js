const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'temp_out.json');
const outputPath = path.join(__dirname, '..', '..', 'web-ui', '.env');
const json = readFileSync(inputPath);
const output = JSON.parse(json);

const {
  apiBaseUrl,
  channelType,
  enableAmazonProductStreamAction,
  region,
  stage,
  userPoolClientId,
  userPoolId,
  appSyncGraphQlApiKey,
  appSyncGraphQlApiEndpoint,
  appSyncGraphQlAuthenticationType,
  webBroadcastQuality = '720'
} = output[process.argv[2]];

const envVars = {
  REACT_APP_API_BASE_URL: apiBaseUrl,
  REACT_APP_CHANNEL_TYPE: channelType,
  REACT_APP_COGNITO_USER_POOL_CLIENT_ID: userPoolClientId,
  REACT_APP_COGNITO_USER_POOL_ID: userPoolId,
  REACT_APP_REGION: region,
  REACT_APP_STAGE: stage,
  REACT_APP_ENABLE_AMAZON_PRODUCT_STREAM_ACTION: enableAmazonProductStreamAction,
  REACT_APP_APPSYNC_GRAPHQL_APIKEY: appSyncGraphQlApiKey,
  REACT_APP_APPSYNC_GRAPHQL_ENDPOINT: appSyncGraphQlApiEndpoint,
  REACT_APP_APPSYNC_GRAPHQL_AUTH_TYPE: appSyncGraphQlAuthenticationType,
  REACT_APP_WEB_BROADCAST_QUALITY: webBroadcastQuality
};

let data = '';
for (const key in envVars) {
  const value = envVars[key];
  data += `${key}=${value}\n`;
}

writeFileSync(outputPath, data);
