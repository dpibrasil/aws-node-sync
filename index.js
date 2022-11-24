const aws = require('aws-sdk')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')

dotenv.config({path: './.env'})

aws.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
})
const s3 = new aws.S3()


async function uploadDir(s3Path, bucketName) {
    async function getFiles(dir) {
        const dirents = fs.readdirSync(dir, { withFileTypes: true })
        const files = await Promise.all(dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name)
            return dirent.isDirectory() ? getFiles(res) : res
        }))
        return Array.prototype.concat(...files)
    }

    const files = (await getFiles(s3Path))
    const uploads = files.map((filePath) => s3.putObject({
        Key: process.env.DEST_PATH + '/' + path.relative(s3Path, filePath),
        Bucket: bucketName,
        Body: fs.createReadStream(filePath),
    }).promise())

    return Promise.all(uploads)
}

uploadDir(path.resolve(process.env.BASE_PATH), process.env.AWS_BUCKET)