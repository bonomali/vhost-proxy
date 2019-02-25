import Url from 'url'
import path from 'path'
import fs from 'fs'
import { validateUrl } from '../utils/url'
import { ensurePath } from '../utils/path'
import config from '../config'
import { createCert } from '../ca/cert'

function loadCA () {
  const caPath = config.get('caPath')
  const certPath = path.join(caPath, 'rootCA.pem')
  const keyPath = path.join(caPath, 'rootCA-key.pem')
  return {
    cert: fs.readFileSync(certPath, 'utf-8').toString(),
    key: fs.readFileSync(keyPath, 'utf-8').toString()
  }
}

async function ensureCert (vhost) {
  const vhostsPath = config.get('vhostsPath')
  const configPath = path.resolve(vhostsPath, vhost.pathname)
  const certPath = path.join(configPath, `${vhost.pathname}.pem`)
  const keyPath = path.join(configPath, `${vhost.pathname}-key.pem`)
  if (!fs.existsSync(certPath)) {
    const ca = loadCA()
    console.log(ca.cert)
    console.log(vhost)
    try {
      const cert = await createCert({
        domains: [ vhost.srcHost ],
        validityDays: 365,
        caKey: ca.key,
        caCert: ca.cert
      })
      console.log(cert.cert)
      fs.writeFileSync(certPath, cert.pem.cert)
      fs.writeFileSync(keyPath, cert.pem.key)
    } catch (err) {
      console.log(err)
      throw err
    }
  }
}

async function proxy (domain, { port, target, https, certPath, keyPath }) {
  if (!port && target === '127.0.0.1') {
    console.log('At least one of --port or --target must be specified')
    process.exit(1)
  }
  const srcUrl = validateUrl(domain)
  if (!srcUrl.isValid) {
    console.log(`${domain} is an invalid domain`)
    process.exit(1)
  }
  const targetUrl = Url.parse(target)
  const vhost = {
    type: 'proxy',
    srcHost: srcUrl.hostname,
    https: https || srcUrl.isHttps,
    isWildcard: srcUrl.isWildcard,
    target: Url.format({
      protocol: targetUrl.protocol || 'http',
      hostname: targetUrl.hostname || targetUrl.pathname,
      port: targetUrl.port || port
    }),
    pathname: srcUrl.pathname,
    certPath,
    keyPath
  }
  const vhostPath = path.resolve(config.get('vhostsPath'), srcUrl.pathname)
  ensurePath(vhostPath)

  if (vhost.https && !vhost.certPath) {
    await ensureCert(vhost)
  }
  const vhostConfigPath = path.resolve(vhostPath, config.get('vhostConfig'))
  fs.writeFileSync(vhostConfigPath, JSON.stringify(vhost, null, 2))
  console.log(`Written config to ${vhostPath}`)
  process.exit(0)
}

export default proxy
