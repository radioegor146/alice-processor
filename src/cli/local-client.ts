import readlineSync from "readline-sync";
import {ProcessorRequest, ProcessorResult} from "../processor";

const ENDPOINT = "http://localhost:8080/process";

async function doRequest(request: ProcessorRequest): Promise<ProcessorResult> {
    return await (await fetch(ENDPOINT, {
        method: "POST",
        body: JSON.stringify(request),
        headers: {
            "content-type": "application/json"
        }
    })).json();
}

(async () => {
    let sessionId: undefined | string = undefined;
    const age = "adult";
    const gender = "male";

    while (true) {
        const text = readlineSync.question("Input: ");
        const result = await doRequest({
            text,
            sessionId,
            biometry: {
                age,
                gender
            }
        });
        console.info("Output:", result);
        sessionId = result.sessionId;
        if (!result.requireMoreInput) {
            return;
        }
    }
})().catch(e => console.error(e));