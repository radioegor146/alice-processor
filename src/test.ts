import fs from 'node:fs'
import { OpenAI } from 'openai'

const openAI = new OpenAI({
  apiKey: 'sk-c1kemAGsqUmO2yARpaXSVg',
  baseURL: 'https://llm.bksp.in',
});

(async () => {
  const response = await openAI.chat.completions.create({
    messages: [
      {
        content: fs.readFileSync('bnf/prompt.en.txt').toString('utf8'),
        role: 'system'
      },
      {
        content: 'сколько времени',
        role: 'user'
      }
    ],
    model: 'Qwen2.5-Coder-32B-Instruct',
  })

  console.info(response.choices[0].message.content)
})().catch(error => console.error(error))
