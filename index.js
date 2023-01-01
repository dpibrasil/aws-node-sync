const aws = require('aws-sdk')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')
const { EventLog } = require('node-eventlog');

const logger = new EventLog('AWS-BACKUP');

dotenv.config({path: './.env'})

const log = fs.createWriteStream(process.env.LOG_PATH, {flags: 'a'})

function addToLog(l)
{
    const content = `[${new Date().toISOString()}] ${l}`
    console.log(content)
    log.write(`\n\n\r` + content)
}

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
    const objects = await new Promise((resolve) => {
        s3.listObjects({
            Bucket: bucketName.split('/')[0],
            Prefix: bucketName.slice(bucketName.indexOf('/') + 1)
        },(err, data) => {
            resolve(data.Contents)
        })
    })

    async function getFiles(dir) {
        const dirents = fs.readdirSync(dir, { withFileTypes: true })
        const files = await Promise.all(dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name)
            return dirent.isDirectory() ? getFiles(res) : res
        }))
        return Array.prototype.concat(...files)
    }

    var files = (await getFiles(s3Path))
    const include = process.env.INCLUDE?.split(';')
    const exclude = process.env.EXCLUDE?.split(';')
    if (include) {
        files = files.filter(file => filterBy(include, file))
    } else if (exclude) {
        files = files.filter(file => !filterBy(exclude, file))
    }

    const uploads = files.map(async (filePath) => {
        try {
            const key =  path.relative(s3Path, filePath)
            const file = fs.statSync(filePath)
            const object = objects.find(object => object.Key.includes(key))
            if (!object || file.mtime >= object.LastModified) {
                const result = await s3.putObject({
                    Key: key,
                    Bucket: bucketName,
                    Body: fs.createReadStream(filePath),
                    Tagging: ''
                }).promise()
                addToLog(`[success] ${filePath} uploaded`)
                return {type: 'success', result, history: {date: new Date().getTime(), key}}
            }
            addToLog(`[success] ${filePath} already updated`)
            return {type: 'success', history: {date: new Date().getTime(), key}}
        } catch (e) {
            addToLog(`[error] ${e.message} white uploading ${filePath}`)
            return {type: 'error', filePath}
        }
    })

    return Promise.all(uploads)
}

uploadDir(path.resolve(process.env.BASE_PATH), process.env.AWS_BUCKET)
.then((data) => {
    const errors = data.filter(d => d.type == 'error')
    const success = data.filter(d => d.type == 'success')
    logger.log(`Sync completed. ${success.length} uploaded and ${errors.length} fail`, errors.length ? 'error' : 'info', 9999)
}) 