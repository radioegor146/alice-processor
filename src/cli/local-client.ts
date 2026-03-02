import readlineSync from 'readline-sync'

import { ProcessorRequest, ProcessorResult } from '../processor'

const ENDPOINT = 'http://localhost:8080/process'

async function doRequest (request: ProcessorRequest): Promise<ProcessorResult> {
  const response = await fetch(ENDPOINT, {
    body: JSON.stringify(request),
    headers: {
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  return await response.json() as ProcessorResult
}

(async () => {
  let sessionId: string | undefined
  const age = 'adult'
  const gender = 'male'

  while (true) {
    const text = readlineSync.question('Input: ')
    const result = await doRequest({
      metadata: {
        age,
        gender
      },
      sessionId,
      text
    })
    console.info('Output:', result)
    sessionId = result.sessionId
    if (!result.requireMoreInput) {
      return
    }
  }
// eslint-disable-next-line unicorn/prefer-top-level-await
})().catch(error => console.error(error))
