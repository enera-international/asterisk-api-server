import { Request } from 'express'
import isValidHostname from "is-valid-hostname"
import fs from 'fs'
import fsp from 'fs/promises'
import chp from 'child_process'
const validCodecs = ["alaw", "ulaw", "g729"]

export class EneraAsteriskApiServer {
    constructor() {
        this.run()
    }
    async run() {
        console.log('running')
        for (;;)
            await new Promise(res => setTimeout(res, 5000))
    }
    asterisk_manager_general_conf_template(amiport: number, secret: string, ip: string) {
        return `port=${amiport}

[linehandler]
secret=${secret}s

; IP permissions
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
permit=${ip}/255.255.255.255

; Privileges
read=all
write=all

; Increasing this value will reduce the likelyhood of Asterisk disconnecting the AMI client
; when it is slow to respond. Asterisk default is 100ms.
writetimeout = 10000
`
    }
    asterisk_sip_conf_header_template(sippport: number, codecs: string) {
        return `[general]\n\
port=%(sipport)d\n\
insecure=no\n\
bindaddr=0.0.0.0\n\
trustrpid=yes\n\
generaterpid=yes\n\
sendrpid=yes\n\
t38pt_udptl=yes,fec,maxdatagram=400\n\
\n\
; Default codec settings, these will be overridden by each provider so this setting primarily applies to incoming calls.\n\
disallow=all\n\
allow=%(codecs)s\n\
\n\
; The user agent to report to sip peers\n\
useragent=RapidReach\n\
\n\
`
    }

    // sip.conf: templates for NAT settings, only append if NAT handling should be enabled
    asterisk_sip_conf_nat_externalip_template(ip: string) {
        return `; NAT settings
nat=force_rport
externip=${ip}
    `
    }
    asterisk_sip_conf_nat_localnet_template(ip: string, mask: string) {
        return `localnet=${ip}/${mask}
`
    }

    // sip.conf: template for sip registrations
    asterisk_sip_conf_registration_template(account: string, secret: string, host: string) {
        return `register => ${account}:${secret}@${host}
`
    }

    // sip.conf: template for sip peers, append these last (there are actually more optional params which are related to authentication, these are handled in the code)
    asterisk_sip_conf_peer_base_template(name: string, host: string, codecs: string) {
        return `[${name}]
type=peer
host=${host}
canreinvite=no
insecure=invite
disallow=all
allow=${codecs}
`
    }

    // rtp.conf
    asterisk_rtp_conf_template(rtpbegin: string, rtpend: string) {
        return `[general]
rtpstart=${rtpbegin}
rtpend=${rtpend}
`
    }
    // extensions.conf
    asterisk_extensions_conf_template() {
        return `
`
    }
    is_valid_ip_string(ip: string) {
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([\da-f]{1,4}:){7}[\da-f]{1,4}$/i;
        if (ipv4Regex.test(ip)) {
            return ip.split('.').every(part => parseInt(part) <= 255);
        }
        if (ipv6Regex.test(ip)) {
            return ip.split(':').every(part => part.length <= 4);
        }
        return false;
    }

    is_valid_hostname(hostname: string) {
        return isValidHostname(hostname)
    }

    is_valid_port(port: number, minport: number) {
        return port >= minport && port <= 65535
    }

    is_valid_port_range(firstport: number, lastport: number, minport: number) {
        return this.is_valid_port(firstport, minport) && this.is_valid_port(lastport, minport) && firstport < lastport
    }

    identifier_regex = /'^[a-z_]+$/

    is_valid_identifier(id: string) {
        const result = id.match(this.identifier_regex)
        return Array.isArray(result) && result.length > 0
    }

    is_valid_codec(codec: string) {
        return validCodecs.indexOf(codec) >= 0
    }

    async validate_general_conf(request: Request, conf: any) {
        if (!conf.linehandler) {
            conf.linehandler = {
                ip: request.ip ?? ''
            }
        }
        if (!this.is_valid_ip_string(conf.linehandler.ip))
            throw new Error(`LineHandler IP ${conf.linehandler.ip} failed validation`)

        if (!this.is_valid_port(conf.ami.port, 1024))
            throw new Error(`AMI Port ${conf.ami.port} failed validation`)

        if (conf.ami.secret === undefined)
            throw new Error(`AMI Secret missing`)

        if (!this.is_valid_port(conf.sip.port, 1024))
            throw new Error(`SIP Port ${conf.sip.port} failed validation`)

        if (!this.is_valid_port_range(conf.sip.rtpportmin, conf.sip.rtpportmax, 1024))
            throw new Error(`RTP Port Range [${conf.sip.rtpportmin},${conf.sip.rtpportmax}] failed validation`)

        for (let codec of conf.sip.codecs) {
            if (!this.is_valid_codec(codec))
                throw new Error(`Global codec ${codec} failed validation`)
        }

        if (conf.sip.nat) {
            if (!this.is_valid_ip_string(conf.sip.externalip))
                throw new Error(`SIP NAT External IP ${conf.sip.externalip} failed validation`)

            for (let net of conf.sip.localnets) {
                if (!this.is_valid_ip_string(net.ip))
                    throw new Error(`SIP LocalNet IP ${net.ip} failed validation`)
                if (!this.is_valid_ip_string(net.mask))
                    throw new Error(`SIP LocalNet Mask ${net.mask} failed validation`)
            }

            for (let provider of conf.sip.providers) {
                if (!this.is_valid_identifier(provider.name))
                    throw new Error(`Provider name ${provider.name} failed validation`)

                if (!this.is_valid_hostname(provider.host))
                    throw new Error(`Host${provider.host}  for provider ${provider} failed validation`)

                for (let codec of provider.codecs) {
                    if (!this.is_valid_codec(codec))
                        throw new Error(`Codec ${codec} for provider ${provider.name} failed validation`)
                }
                if (provider.register) {
                    if (!provider.account)
                        throw new Error(`Account missing for provider ${provider}`)
                    if (!provider.secret)
                        throw new Error(`Secret missing for provider ${provider}`)
                }
            }
        }
    }

    async handle_json_config_file(request: Request, filename: string, data_validation_function: (request: Request, conf: object) => Promise<void>, post_modification_function: (request: Request) => Promise<void>) {
        let result
        if (request.method === 'GET') {
            const obj = JSON.parse(await fsp.readFile(filename, { encoding: 'utf8' }))
            await data_validation_function(request, obj)
            result = obj
        } else if (request.method === 'POST') {
            const json = request.body
            await data_validation_function(request, json)
            await fsp.writeFile(filename, JSON.stringify(json), { encoding: 'utf8' })
            if (post_modification_function)
                await post_modification_function(request)
            result = { "success": true }
        }
        return result
    }

    async update_system_configuration(request: Request) {
        const general = JSON.parse(await fsp.readFile("/var/asterisk/api/general.conf", { encoding: 'utf8'}))
        this.validate_general_conf(request, general)

        // Generate configuration files given the source data
        const asterisk_manager_general_conf = this.asterisk_manager_general_conf_template(general.ami.port, general.ami.secret, general.linehandler.ip)
        let asterisk_sip_conf = this.asterisk_sip_conf_header_template(general.sip.port, general.sip.codecs.toString())
        if (general.sip.nat) {
            asterisk_sip_conf += this.asterisk_sip_conf_nat_externalip_template(general.sipexternalip)
            for (let net of general.sip.localnets)
                asterisk_sip_conf += this.asterisk_sip_conf_nat_localnet_template(net.ip, net.mask)
        }
        asterisk_sip_conf += "\n; Provider settings\n\n"
        for (let provider of general.sip.providers) {
            if (provider.register)
                asterisk_sip_conf += this.asterisk_sip_conf_registration_template(provider.account, provider.secret, provider.host)
        }
        for (let provider of general.sip.providers) {
            asterisk_sip_conf += "\n"
            asterisk_sip_conf += this.asterisk_sip_conf_peer_base_template(provider.name, provider.host, provider.codecs.toString())
            if (provider.account !== undefined)
                asterisk_sip_conf += "defaultuser=" + provider.account + "\n"
            if (provider.secret !== undefined)
                asterisk_sip_conf += "secret=" + provider.secret + "\n"
            if (provider.realm !== undefined)
                asterisk_sip_conf += "realm=" + provider.realm + "\n"
            if (provider.fromuser !== undefined)
                asterisk_sip_conf += "fromuser=" + provider.fromuser + "\n"
            if (provider.fromdomain !== undefined)
                asterisk_sip_conf += "fromdomain=" + provider.fromdomain + "\n"
            if (provider.sendrpid !== undefined && provider.sendrpid)
                asterisk_sip_conf += "sendrpid=" + provider.sendrpid + "\n"
        }
        const asterisk_rtp_conf = this.asterisk_rtp_conf_template(general.sip.rtpportmin, general.sip.rtpportmax)
        const asterisk_extensions_conf = this.asterisk_extensions_conf_template()
        const asterisk_extensions_globals_conf = ""
        const asterisk_extensions_default_conf = ""
        const asterisk_extensions_incoming_conf = ""
        const asterisk_extensions_outgoing_conf = ""
        const asterisk_extensions_additional_conf = ""
        
        // Write the configuration files to disk
        await fsp.writeFile("/var/asterisk/etc/enera/manager-general.conf", asterisk_manager_general_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/sip-extensions.conf", asterisk_sip_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/rtp-general.conf", asterisk_rtp_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/extensions-globals.conf", asterisk_extensions_globals_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/extensions-default.conf", asterisk_extensions_default_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/extensions-incoming.conf", asterisk_extensions_incoming_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/extensions-outgoing.conf", asterisk_extensions_outgoing_conf, {encoding: 'utf8' })
        await fsp.writeFile("/var/asterisk/etc/enera/extensions-additional.conf", asterisk_extensions_additional_conf, {encoding: 'utf8' })
        
        // Restart system services which depend on the configuration files
        chp.exec("sudo restart_smbd")
        chp.exec("sudo restart_asterisk")
    }

    async general(request: Request) {
        let result
        try {
            result = await this.handle_json_config_file(request, "/var/asterisk/api/general.conf", this.validate_general_conf.bind(this), this.update_system_configuration.bind(this))
        } catch(error: any) {
            result = { "success": false, errorMessage: error.message, errorStack: error.stack }
        } 
        return result
    }

    test() {
        let b = this.is_valid_ip_string('1.2.3.4')
        b = this.is_valid_hostname('a.com')
        console.log(b)
    }
}
