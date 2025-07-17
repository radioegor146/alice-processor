import {OpenAI} from "openai";
import fs from "fs";

const openAI = new OpenAI({
    baseURL: "https://llm.bksp.in",
    apiKey: "sk-c1kemAGsqUmO2yARpaXSVg",
});

// const promptGenerator = new PromptGenerator(fs.readFileSync("bnf/prompt"));

(async () => {
    const response = await openAI.chat.completions.create({
        model: "Qwen2.5-Coder-32B-Instruct",
        messages: [
            {
                role: "system",
                content: fs.readFileSync("bnf/prompt.en.txt").toString("utf8")
            },
            {
                role: "user",
                content: "сколько времени"
            }
        ],
    });

    console.info(response.choices[0].message.content);
})().catch(e => console.error(e));