import mongoose, { Schema, Document } from 'mongoose';

export interface IEntity extends Document {
    userId: string;
    projectId: string;
    entityType: string; // e.g., 'LongTermGoal', 'Task', 'Walkthrough', 'Rule'
    name: string;
    properties: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface IRelation extends Document {
    userId: string;
    projectId: string;
    fromId: mongoose.Types.ObjectId;
    toId: mongoose.Types.ObjectId;
    relationType: string; // e.g., 'DEPENDS_ON', 'FOLLOWS', 'PART_OF'
    properties: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const EntitySchema = new Schema<IEntity>(
    {
        userId: { type: String, required: true },
        projectId: { type: String, required: true },
        entityType: { type: String, required: true },
        name: { type: String, required: true },
        properties: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Indexes for fast retrieval by user + project + type
EntitySchema.index({ userId: 1, projectId: 1, entityType: 1 });
EntitySchema.index({ userId: 1, projectId: 1, name: 1 });

const RelationSchema = new Schema<IRelation>(
    {
        userId: { type: String, required: true },
        projectId: { type: String, required: true },
        fromId: { type: Schema.Types.ObjectId, ref: 'Entity', required: true },
        toId: { type: Schema.Types.ObjectId, ref: 'Entity', required: true },
        relationType: { type: String, required: true },
        properties: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Indexes for graph traversal
RelationSchema.index({ userId: 1, projectId: 1, fromId: 1, relationType: 1 });
RelationSchema.index({ userId: 1, projectId: 1, toId: 1, relationType: 1 });

export const Entity = mongoose.model<IEntity>('Entity', EntitySchema);
export const Relation = mongoose.model<IRelation>('Relation', RelationSchema);

export const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/memory-mcp";

export const initMongo = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            // V6 System Hardening: Advanced Connection Resilience
            maxPoolSize: 50,           // Handle highly concurrent agent tool spikes
            wtimeoutMS: 2500,          // Time to wait for Write Acknowledgment
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,    // Ensure long-running RAG queries don't drop
            autoIndex: false           // Do not build indexes in Prod unexpectedly
        });
        console.error("MongoDB Atlas Connected (Graph Structure) [V6 Resilient Pool Active]");

        // V6 System Hardening: Network Drop Self-Healing Listeners
        mongoose.connection.on('disconnected', () => {
            console.error('MongoDB disconnected! Attempting resilient reconnection...');
        });

    } catch (err: any) {
        console.error("MongoDB Fatal Connection Error:", err.message);
        process.exit(1);
    }
};
