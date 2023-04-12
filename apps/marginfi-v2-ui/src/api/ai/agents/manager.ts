import { OpenAI } from "langchain";
import { initializeAgentExecutor } from "langchain/agents";

import { BanksTool, TokenInfoTool, getOmniQaTool } from '../tools';

const getManagerAgent = async() => {
    const model = new OpenAI({ 
      modelName: "gpt-3.5-turbo",
      openAIApiKey: process.env.OPENAI_API_KEY, 
      maxTokens: 1000,
      temperature: 0.8,
      verbose: true,
    });
    
    const tools = [
      new BanksTool(), 
      new TokenInfoTool(),
      await getOmniQaTool(),
    ];

    const executor = await initializeAgentExecutor(
      tools,
      model,
      "zero-shot-react-description"
    );
    return executor;
}

export { 
  getManagerAgent
}
