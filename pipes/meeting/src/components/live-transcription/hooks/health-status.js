"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useServiceStatus = useServiceStatus;
const react_1 = require("react");
function useServiceStatus() {
    const [serviceStatus, setServiceStatus] = (0, react_1.useState)('unavailable');
    const [isChecking, setIsChecking] = (0, react_1.useState)(false);
    const checkService = (startTranscription) => __awaiter(this, void 0, void 0, function* () {
        if (isChecking) {
            console.log('health-status: skipping check - already in progress');
            return;
        }
        setIsChecking(true);
        console.log('health-status: starting service check');
        let testSource = null;
        try {
            testSource = new EventSource('http://localhost:3030/sse/transcriptions');
            const result = yield Promise.race([
                new Promise((resolve, reject) => {
                    testSource.onopen = () => {
                        console.log('health-status: test connection opened');
                    };
                    testSource.onmessage = (event) => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b, _c, _d;
                        console.log('health-status: received test message:', event.data);
                        if (event.data === 'keep-alive-text') {
                            console.log('health-status: received keep-alive, service available');
                            setServiceStatus('available');
                            yield startTranscription();
                            resolve();
                            return;
                        }
                        try {
                            const chunk = JSON.parse(event.data);
                            console.log('health-status: parsed test chunk:', chunk);
                            if (((_a = chunk.error) === null || _a === void 0 ? void 0 : _a.includes('invalid subscription')) ||
                                ((_d = (_c = (_b = chunk.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.text) === null || _d === void 0 ? void 0 : _d.includes('invalid subscription'))) {
                                console.log('health-status: invalid subscription detected');
                                setServiceStatus('no_subscription');
                                reject(new Error('invalid subscription'));
                            }
                            else {
                                console.log('health-status: service check successful');
                                setServiceStatus('available');
                                yield startTranscription();
                                resolve();
                            }
                        }
                        catch (e) {
                            console.error('health-status: failed to parse chunk:', e);
                            reject(e);
                        }
                    });
                    testSource.onerror = (error) => {
                        console.error('health-status: test connection error:', error);
                        setServiceStatus('unavailable');
                        reject(new Error('health check failed'));
                    };
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('health check timeout')), 5000))
            ]);
            return result;
        }
        catch (error) {
            console.error('health-status: service check failed:', error);
            setServiceStatus('unavailable');
        }
        finally {
            testSource === null || testSource === void 0 ? void 0 : testSource.close();
            setIsChecking(false);
            console.log('health-status: check completed, status:', serviceStatus);
        }
    });
    const getStatusMessage = () => {
        switch (serviceStatus) {
            case 'no_subscription':
                return "please subscribe to screenpipe cloud in settings";
            case 'forbidden':
                return "please enable real-time transcription in screenpipe settings";
            case 'unavailable':
                return "waiting for screenpipe to be available...";
            default:
                return "transcribing...";
        }
    };
    return { serviceStatus, checkService, getStatusMessage };
}
