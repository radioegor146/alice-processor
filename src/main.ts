import express from "express";
import dotenv from "dotenv";
import {getLogger} from "./logger";
import {Processor} from "./processor";
import {OpenAI} from "openai";
import fs from "fs";
import z from "zod";
import {InMemorySessionStorage} from "./session-storage/in-memory";
import {StateServer} from "./llm/state/types";
import {SystemStateServer} from "./llm/state/system";
import {RemoteStateServer} from "./llm/state/remote";
import {FunctionServer} from "./llm/function/types";
import {RemoteFunctionServer} from "./llm/function/remote";
import {ChatCompletionMessageParam} from "openai/src/resources/chat/completions/completions";
import {HandlebarsPromptGenerator} from "./llm/prompt-generator/handlebars";
import {PlainResponseParser} from "./llm/response-parser/plain";
import {FunctionCallFormatResponseParser} from "./llm/response-parser/function-call-format";
import {createAliceDirectiveFunctionServer} from "./llm/function/alice-directive";

const logger = getLogger();

dotenv.config({
    path: ".env.local"
});
dotenv.config();

const PORT = parseInt(process.env.PORT || "8080");

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://llm.bksp.in";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "qwen2.5-coder-7b-instruct";

const PROCESSOR_PROMPT_TEMPLATE_PATH = process.env.PROMPT_TEMPLATE_PATH ?? "prompt.handlebars";
const PROCESSOR_FUNCTION_SERVER_URLS = (process.env.PROCESSOR_FUNCTION_SERVER_URLS ?? "").split(",").filter(url => url);
const PROCESSOR_STATE_SERVER_URLS = (process.env.PROCESSOR_STATE_SERVER_URLS ?? "").split(",").filter(url => url);

const app = express();

const requestType = z.object({
    text: z.string(),
    sessionId: z.string().uuid().optional()
});

const openAI = new OpenAI({
    baseURL: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
});

const stateServers: StateServer[] = [
    new SystemStateServer()
];
for (const url of PROCESSOR_STATE_SERVER_URLS) {
    stateServers.push(new RemoteStateServer(url));
}

const functionServers: FunctionServer[] = [
    createAliceDirectiveFunctionServer()
];
for (const url of PROCESSOR_FUNCTION_SERVER_URLS) {
    functionServers.push(new RemoteFunctionServer(url));
}

const promptGenerator = new HandlebarsPromptGenerator(
    fs.readFileSync(PROCESSOR_PROMPT_TEMPLATE_PATH).toString("utf8"));

const sessionStorage = new InMemorySessionStorage<ChatCompletionMessageParam[]>();

const responseParser = new FunctionCallFormatResponseParser();

const processor = new Processor({
    openAI,
    model: OPENAI_MODEL,
    promptGenerator,
    functionServers,
    stateServers,
    sessionStorage,
    responseParser
});

app.use(express.json());
app.post("/process", (req, res) => {
    try {
        processor.process(requestType.parse(req.body))
            .then(result => {
                res.status(200).json({
                    success: true,
                    ...result
                });
            })
            .catch(err => {
                logger.error(`Processor error: ${err}`);
                res.status(500).json({
                    success: false,
                    error: err.toString()
                });
            });
    } catch (err) {
        logger.error(`Processor error: ${err}`);
        res.status(500).json({
            success: false,
            error: String(err)
        });
    }
});

app.listen(PORT, error => {
    if (error) {
        logger.fatal(`Failed to start on :${PORT}: ${error}`);
        return;
    }
    logger.info(`Started on :${PORT}`);
});
