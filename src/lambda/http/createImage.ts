import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import 'source-map-support/register'
import * as AWS  from 'aws-sdk'
import * as uuid from 'uuid'

const groupsTable = process.env.GROUPS_TABLE
const imagesTable = process.env.IMAGES_TABLE
const bucketName = process.env.IMAGES_S3_BUCKET
const urlExpirationTime = parseInt(process.env.SIGNED_URL_EXPIRATION)

const docClient = new AWS.DynamoDB.DocumentClient()

const s3 = new AWS.S3({
  signatureVersion: 'v4'
})

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {

  console.log('Processing event', event)
  const groupId = event.pathParameters.groupId
  const validGroupId = await groupExists(groupId)

  if (!validGroupId) {
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Group does not exist'
      })
    }
  }

  const parsedBody = JSON.parse(event.body)
  const imageTitle = parsedBody.imageTitle
  const imageId = uuid.v4()
  console.log(`parsedBody: ${parsedBody}`)
  const newImage = {
    'imageId': imageId,
    'groupId': groupId,
    'timestamp': new Date().toISOString(),
    'imageTitle': imageTitle,
    'imageUrl': `https://${bucketName}.s3.amazonaws.com/${imageId}`
  }

  await docClient.put({
    TableName: imagesTable,
    Item: newImage
  }).promise()

  const url = await getUploadUrl(imageId)
  console.log(`signedUrl: ${url}`)
  return {
    statusCode: 201,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
        newImage: newImage,
        uploadUrl: url
    })
  }
}

async function groupExists(groupId: string) {
  const result = await docClient.get({
      TableName: groupsTable,
      Key: {
        id: groupId
      }
    })
    .promise()

  console.log('Get group: ', result)
  return !!result.Item
}

async function getUploadUrl(imageId: string) {
  return s3.getSignedUrl('putObject', {
    Bucket: bucketName,
    Key: imageId,
    Expires: urlExpirationTime
  })
}