import { promptTemplates, getPromptTemplate, allPrompts } from "./templates.js";

export const getPrompts = async () => {
    const prompts = allPrompts.map(template => ({
        name: template.name,
        description: template.description,
        arguments: template.arguments.map(arg => ({
            name: arg.name,
            description: arg.description,
            required: arg.required
        }))
    }));
    
    return { prompts };
};

export const getPrompt = async (name: string, args: Record<string, any>) => {
    const template = allPrompts.find(p => p.name === name);
    
    if (!template) {
        throw new Error(`Prompt '${name}' not found`);
    }
    
    // Validate required arguments
    const missingArgs = template.arguments
        .filter(arg => arg.required && !args[arg.name])
        .map(arg => arg.name);
    
    if (missingArgs.length > 0) {
        throw new Error(`Missing required arguments: ${missingArgs.join(', ')}`);
    }
    
    // Generate the prompt content
    const result = await template.generate(args);
    
    return {
        description: template.description,
        messages: result.messages
    };
};