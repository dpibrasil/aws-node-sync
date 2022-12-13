const aws = require('aws-sdk')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')

dotenv.config({path: './.env'})
const filterBy = (strs, path) => {
    for (const str of strs) {
        if (new RegExp('^' + str.replace(/\*/g, '.*') + '$').test(path)) return true
    }
    return false
}

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

    var files = (await getFiles(s3Path))
    console.log(files)
    const include = process.env.INCLUDE?.split(';')
    const exclude = process.env.EXCLUDE?.split(';')
    if (include) {
        files = files.filter(file => filterBy(include, file))
    } else if (exclude) {
        files = files.filter(file => !filterBy(exclude, file))
    }

    const uploads = files.map((filePath) => s3.putObject({
        Key: process.env.DEST_PATH + '/' + path.relative(s3Path, filePath),
        Bucket: bucketName,
        Body: fs.createReadStream(filePath),
    }).promise())

    return Promise.all(uploads)
}

uploadDir(path.resolve(process.env.BASE_PATH), process.env.AWS_BUCKET)