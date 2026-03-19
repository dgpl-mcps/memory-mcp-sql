import { db } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

interface ExtractedEntity {
    name: string;
    type: "Person" | "Bot" | "Organization" | "Task" | "Event" | "Topic" | "Other";
    email?: string;
    phone?: string;
    role?: string;
    confidence: number;
    metadata: Record<string, any>;
}

interface ExtractedRelation {
    from: string;
    to: string;
    type: string;
    confidence: number;
}

interface ExtractionResult {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    topics: string[];
    deadlines: { task: string; date: string; owner?: string }[];
    summary: string;
}

const PATTERNS = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    mention: /@([a-zA-Z0-9_]+)/g,
    date: /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}|(?:next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|weekend))/gi,
    time: /\b(\d{1,2}:\d{2}(?:\s*(?:am|pm|AM|PM))?)/g,
};

const PERSON_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sir", "Madam", "CEO", "CTO", "Manager", "Director", "Engineer", "Developer", "Designer", "Analyst"];

const BOT_INDICATORS = ["bot", "assistant", "ai", "agent", "chatbot", "voice assistant", "alexa", "siri", "cortana", "google assistant"];
const ORG_SUFFIXES = ["Inc.", "LLC", "Ltd.", "Corp.", "Corporation", "Company", "Co.", "Technologies", "Tech", "Solutions", "Systems", "Labs", "Enterprises"];

export function extractWithPatterns(text: string): ExtractionResult {
    const entities: ExtractedEntity[] = [];
    const relations: ExtractedRelation[] = [];
    const topics: string[] = [];
    const deadlines: { task: string; date: string; owner?: string }[] = [];

    const emails = text.match(PATTERNS.email);
    if (emails) {
        emails.forEach(email => {
            entities.push({
                name: email.split("@")[0],
                type: "Person",
                email,
                confidence: 0.9,
                metadata: { source: "email_pattern" }
            });
        });
    }

    const phones = text.match(PATTERNS.phone);
    if (phones) {
        phones.forEach(phone => {
            entities.push({
                name: phone,
                type: "Person",
                phone,
                confidence: 0.8,
                metadata: { source: "phone_pattern" }
            });
        });
    }

    const mentions = text.match(PATTERNS.mention);
    if (mentions) {
        mentions.forEach(mention => {
            const username = mention.slice(1);
            entities.push({
                name: username,
                type: "Person",
                confidence: 0.7,
                metadata: { source: "mention", username }
            });
        });
    }

    const namePattern = new RegExp(`(?:(${PERSON_TITLES.join("|")})\\s+)?([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)`, "g");
    let match;
    while ((match = namePattern.exec(text)) !== null) {
        const [, title, fullName] = match;
        if (fullName && !emails?.some(e => text.includes(fullName))) {
            entities.push({
                name: fullName,
                type: "Person",
                role: title?.replace(".", ""),
                confidence: 0.6,
                metadata: { source: "name_pattern" }
            });
        }
    }

    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const word = words[i].replace(/[.,;:!?]$/, "");
        const lowerWord = word.toLowerCase();
        const nextWord = words[i + 1]?.replace(/[.,;:!?]$/, "").toLowerCase() || "";
        const nextNextWord = words[i + 2]?.replace(/[.,;:!?]$/, "").toLowerCase() || "";

        if (BOT_INDICATORS.some(bot => lowerWord.includes(bot) || nextWord.includes(bot))) {
            const botName = words[i + 1] || word;
            entities.push({
                name: botName,
                type: "Bot",
                confidence: 0.8,
                metadata: { source: "keyword_detection" }
            });
        }

        if (ORG_SUFFIXES.some(suffix => nextWord.includes(suffix.toLowerCase()) || nextNextWord.includes(suffix.toLowerCase()))) {
            const orgName = [words[i], words[i + 1], words[i + 2]].filter(Boolean).join(" ");
            entities.push({
                name: orgName,
                type: "Organization",
                confidence: 0.7,
                metadata: { source: "suffix_detection" }
            });
        }
    }

    const relationPatterns = [
        { regex: /(\w+)\s+(?:works?\s+(?:with|together\s+with)|collaborates?\s+with)\s+(\w+)/gi, type: "WORKS_WITH" },
        { regex: /(\w+)\s+(?:knows?|met|saw|talked\s+to)\s+(\w+)/gi, type: "KNOWS" },
        { regex: /(\w+)\s+(?:belongs?\s+to|is\s+(?:a|an)\s+(?:member\s+of|part\s+of))\s+(\w+)/gi, type: "BELONGS_TO" },
        { regex: /(\w+)\s+(?:manages?|leads?|supervises?)\s+(\w+)/gi, type: "MANAGED_BY", reverse: true },
        { regex: /(\w+)\s+(?:owns?|created?|built)\s+(\w+)/gi, type: "OWNS" },
        { regex: /(\w+)\s+(?:told|said\s+to|informed|notified)\s+(\w+)/gi, type: "TOLD" },
        { regex: /(\w+)\s+(?:contacted?|reached\s+out\s+to)\s+(\w+)/gi, type: "CONTACTS" },
        { regex: /(\w+)\s+(?:is|are)\s+(?:a|an)?\s*(\w+(?:\s+\w+)?)\s+(?:for|of)\s+(\w+)/gi, type: "DEADLINE_FOR", extractTask: 2 },
    ];

    relationPatterns.forEach(({ regex, type, reverse }) => {
        let relMatch;
        while ((relMatch = regex.exec(text)) !== null) {
            const [, from, to, taskName] = relMatch;
            const extractedTo = taskName || to;
            relations.push({
                from: reverse ? extractedTo : from,
                to: reverse ? from : extractedTo,
                type,
                confidence: 0.6
            });

            if (type === "TOLD" && taskName) {
                const taskMatch = text.match(/(?:to|that|about)\s+(?:complete|finish|do|submit|send|deliver)\s+([^.]+)/i);
                if (taskMatch) {
                    const dateMatch = text.match(PATTERNS.date);
                    deadlines.push({
                        task: taskMatch[1].trim(),
                        date: dateMatch ? parseDate(dateMatch[0]) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        owner: from
                    });
                }
            }
        }
    });

    const topicWords = ["project", "topic", "subject", "matter", "issue", "regarding"];
    topicWords.forEach(tw => {
        const topicMatch = text.match(new RegExp(`(?:${tw}):\\s*([A-Za-z0-9\\s]+?)(?:\\.|,|$)`, "i"));
        if (topicMatch) {
            topics.push(topicMatch[1].trim());
        }
    });

    const uniqueEntities = deduplicateEntities(entities);

    return {
        entities: uniqueEntities,
        relations,
        topics,
        deadlines,
        summary: generateSummary(text, uniqueEntities)
    };
}

function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>();
    entities.forEach(entity => {
        const key = `${entity.type}-${entity.name.toLowerCase()}`;
        const existing = seen.get(key);
        if (!existing || entity.confidence > existing.confidence) {
            seen.set(key, entity);
        }
    });
    return Array.from(seen.values());
}

function parseDate(dateStr: string): string {
    try {
        const lower = dateStr.toLowerCase();
        if (lower.includes("tomorrow")) {
            return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }
        if (lower.includes("today")) {
            return new Date().toISOString();
        }
        if (lower.includes("next sunday") || lower.includes("sunday")) {
            const today = new Date();
            const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
            return new Date(today.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000).toISOString();
        }
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : parsed.toISOString();
    } catch {
        return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
}

function generateSummary(text: string, entities: ExtractedEntity[]): string {
    const persons = entities.filter(e => e.type === "Person").map(e => e.name);
    const bots = entities.filter(e => e.type === "Bot").map(e => e.name);
    const orgs = entities.filter(e => e.type === "Organization").map(e => e.name);
    
    let summary = "";
    if (persons.length) summary += `Persons: ${persons.join(", ")}. `;
    if (bots.length) summary += `Bots: ${bots.join(", ")}. `;
    if (orgs.length) summary += `Organizations: ${orgs.join(", ")}. `;
    
    return summary || text.slice(0, 100);
}

export async function extractWithLLM(text: string, useFallback: boolean = true): Promise<ExtractionResult> {
    const patternResult = extractWithPatterns(text);
    
    try {
        const embeddingUrl = process.env.LLM_EXTRACTION_URL;
        if (!embeddingUrl) {
            return patternResult;
        }

        const prompt = `Extract entities and relationships from this text. Return JSON with:
{
  "entities": [{"name": "string", "type": "Person|Bot|Organization|Task|Event|Topic", "email": "string?", "role": "string?", "confidence": 0.0-1.0, "metadata": {}}],
  "relations": [{"from": "string", "to": "string", "type": "KNOWS|WORKS_WITH|TOLD|CONTACTS|BELONGS_TO|MANAGED_BY|OWNS|DEADLINE_FOR", "confidence": 0.0-1.0}],
  "topics": ["topic1", "topic2"],
  "deadlines": [{"task": "string", "date": "ISO date string", "owner": "string?"}],
  "summary": "brief summary"
}

Text: ${text}

Return ONLY JSON, no markdown.`;

        const res = await fetch(embeddingUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                max_tokens: 1000
            })
        });

        if (!res.ok) {
            throw new Error(`LLM extraction failed: ${res.status}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || data.content || "{}";
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return patternResult;
        }

        const llmResult = JSON.parse(jsonMatch[0]);
        
        const mergedEntities = mergeExtractionResults(patternResult.entities, llmResult.entities || []);
        
        return {
            entities: mergedEntities,
            relations: [...patternResult.relations, ...(llmResult.relations || [])],
            topics: [...new Set([...patternResult.topics, ...(llmResult.topics || [])])],
            deadlines: [...patternResult.deadlines, ...(llmResult.deadlines || [])],
            summary: llmResult.summary || patternResult.summary
        };
    } catch (error) {
        console.error("LLM extraction failed:", error);
        return useFallback ? patternResult : { entities: [], relations: [], topics: [], deadlines: [], summary: "" };
    }
}

function mergeExtractionResults(patternEntities: ExtractedEntity[], llmEntities: any[]): ExtractedEntity[] {
    const merged = new Map<string, ExtractedEntity>();
    
    patternEntities.forEach(e => {
        const key = `${e.type}-${e.name.toLowerCase()}`;
        merged.set(key, e);
    });
    
    llmEntities.forEach(e => {
        const key = `${e.type}-${e.name.toLowerCase()}`;
        const existing = merged.get(key);
        if (!existing || (e.confidence > (existing.confidence || 0))) {
            merged.set(key, {
                name: e.name,
                type: e.type,
                email: e.email,
                phone: e.phone,
                role: e.role,
                confidence: e.confidence || 0.7,
                metadata: e.metadata || {}
            });
        }
    });
    
    return Array.from(merged.values());
}

export function createEntityId(type: string, name: string, ownerId: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30);
    return `${type.toLowerCase()}_${ownerId}_${normalized}_${Date.now()}`;
}

export function storeExtractedEntities(
    ownerId: string,
    projectId: string,
    result: ExtractionResult,
    sessionId?: string,
    topicId?: string,
    sourcePersonId?: string
): { entities: any[], relations: any[], memoryIds: any[] } {
    const storedEntities: any[] = [];
    const storedRelations: any[] = [];
    const memoryIds: any[] = [];

    result.entities.forEach(entity => {
        if (entity.confidence < 0.5) return;
        
        const entityId = createEntityId(entity.type, entity.name, ownerId);
        
        try {
            db.prepare(`
                INSERT OR REPLACE INTO Entities 
                (id, userId, projectId, entityType, name, email, phone, role, properties, ownerId, perspectiveOf)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                entityId,
                ownerId,
                projectId,
                entity.type,
                entity.name,
                entity.email || null,
                entity.phone || null,
                entity.role || null,
                JSON.stringify(entity.metadata),
                ownerId,
                "self"
            );
            
            storedEntities.push({ id: entityId, ...entity });
        } catch (e) {
            console.error("Failed to store entity:", e);
        }
    });

    result.relations.forEach(relation => {
        if (relation.confidence < 0.5) return;
        
        const fromEntity = storedEntities.find(e => e.name.toLowerCase() === relation.from.toLowerCase());
        const toEntity = storedEntities.find(e => e.name.toLowerCase() === relation.to.toLowerCase());
        
        if (!fromEntity || !toEntity) return;
        
        const relId = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        try {
            db.prepare(`
                INSERT INTO Relations
                (id, userId, projectId, fromId, toId, relationType, properties)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                relId,
                ownerId,
                projectId,
                fromEntity.id,
                toEntity.id,
                relation.type,
                JSON.stringify({ confidence: relation.confidence })
            );
            
            storedRelations.push({ id: relId, ...relation });
        } catch (e) {
            console.error("Failed to store relation:", e);
        }
    });

    if (result.summary) {
        const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        try {
            db.prepare(`
                INSERT INTO Timeline
                (id, ownerId, sessionId, topicId, perspectiveOf, sourcePersonId, content, entities, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                memoryId,
                ownerId,
                sessionId || null,
                topicId || null,
                sourcePersonId ? "other" : "self",
                sourcePersonId || null,
                result.summary,
                JSON.stringify(storedEntities.map(e => e.id)),
                0.6
            );
            
            memoryIds.push({ id: memoryId, type: "timeline" });
        } catch (e) {
            console.error("Failed to store timeline:", e);
        }
    }

    result.deadlines.forEach(deadline => {
        const taskEntity = storedEntities.find(e => 
            e.name.toLowerCase().includes(deadline.task?.toLowerCase() || "")
        );
        
        if (taskEntity || deadline.task) {
            const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            
            try {
                db.prepare(`
                    INSERT INTO Entities
                    (id, userId, projectId, entityType, name, properties, ownerId)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    taskEntity?.id || taskId,
                    ownerId,
                    projectId,
                    "Task",
                    deadline.task || "Unnamed Task",
                    JSON.stringify({ deadline: deadline.date, owner: deadline.owner }),
                    ownerId
                );
                
                if (deadline.owner) {
                    const ownerEntity = storedEntities.find(e => 
                        e.name.toLowerCase() === deadline.owner?.toLowerCase()
                    );
                    
                    if (ownerEntity) {
                        db.prepare(`
                            INSERT INTO Relations
                            (id, userId, projectId, fromId, toId, relationType, properties)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `).run(
                            `rel_task_${Date.now()}`,
                            ownerId,
                            projectId,
                            taskEntity?.id || taskId,
                            ownerEntity.id,
                            "DEADLINE_FOR",
                            JSON.stringify({ deadline: deadline.date })
                        );
                    }
                }
            } catch (e) {
                console.error("Failed to store deadline:", e);
            }
        }
    });

    return { entities: storedEntities, relations: storedRelations, memoryIds };
}
