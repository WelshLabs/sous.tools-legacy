const fs = require('fs');
const file = 'apps/api/src/modules/ingestion/ingestion.processor.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace emitIngestionUpdate with emitChatMessageToConversation for IN_PROGRESS
content = content.replace(/this\.commandsGateway\.emitIngestionUpdate\(\{\s*reviewId: "pending",\s*conversationId,\s*status: "IN_PROGRESS",\s*message:\s*("Step [^"]+"),\s*orgId: organizationId,\s*userId,\s*\}\);/g, 
  `this.commandsGateway.emitChatMessageToConversation(
          conversationId,
          {
            id: randomUUID(),
            role: "agent_step",
            content: $1,
            timestamp: new Date(),
          },
          organizationId
        );`);

fs.writeFileSync(file, content);
