import assert from 'node:assert/strict';
import {
    findMijiaPasscodeValue,
    parseMijiaPasscodeCaptureText,
} from './lib/mijiaPasscode';

const passcodeBody = 'data=' + encodeURIComponent(JSON.stringify({
    method: 'miIO.get_central_link_passcode',
    params: [],
}));

const har = {
    log: {
        entries: [
            {
                request: {
                    method: 'POST',
                    url: 'https://core.api.mijia.tech/app/home/rpc/123',
                    headers: [
                        {name: 'Cookie', value: 'serviceToken=token'},
                        {name: 'MIOT-REQUEST-MODEL', value: 'xiaomi.gateway.hub2'},
                    ],
                    postData: {
                        text: 'data=' + encodeURIComponent(JSON.stringify({
                            method: 'miIO.get_autowebconfig_url',
                            params: [],
                        })),
                    },
                },
            },
            {
                request: {
                    method: 'POST',
                    url: 'https://core.api.mijia.tech/app/home/rpc/456',
                    headers: [
                        {name: 'MIOT-REQUEST-MODEL', value: 'xiaomi.gateway.hub2'},
                    ],
                    postData: {text: passcodeBody},
                },
            },
        ],
    },
};

const parsedHar = parseMijiaPasscodeCaptureText(JSON.stringify(har));
assert.equal(parsedHar.found, true);
assert.equal(parsedHar.matchedRequestCount, 1);
assert.equal(parsedHar.config.requestUrl, 'https://core.api.mijia.tech/app/home/rpc/456');
assert.equal(parsedHar.config.passcodeRequestBody, passcodeBody);
assert.equal(parsedHar.config.miotRequestModel, 'xiaomi.gateway.hub2');

const curl = `curl 'https://core.api.mijia.tech/app/home/rpc/789' \\
  -H 'MIOT-REQUEST-MODEL: xiaomi.gateway.hub3' \\
  -H 'Cookie: serviceToken=token' \\
  --data-raw '${passcodeBody}'`;
const parsedCurl = parseMijiaPasscodeCaptureText(curl);
assert.equal(parsedCurl.found, true);
assert.equal(parsedCurl.matchedRequestCount, 1);
assert.equal(parsedCurl.config.miotRequestModel, 'xiaomi.gateway.hub3');

const nonPasscodeCurl = `curl 'https://core.api.mijia.tech/app/home/rpc/789' --data-raw 'data=${encodeURIComponent(JSON.stringify({method: 'miIO.get_autowebconfig_url'}))}'`;
const parsedNonPasscodeCurl = parseMijiaPasscodeCaptureText(nonPasscodeCurl);
assert.equal(parsedNonPasscodeCurl.found, false);
assert.equal(parsedNonPasscodeCurl.matchedRequestCount, 0);

assert.equal(findMijiaPasscodeValue({result: {passcode: '123456'}}), '123456');

console.log('mijiaPasscode parser tests passed');
