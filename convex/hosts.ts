import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const updateStatus = mutation({
  args: {
    hostId: v.string(),
    status: v.union(v.literal("online"), v.literal("offline")),
    activeDirectories: v.array(
      v.object({
        path: v.string(),
        port: v.number(),
        pid: v.number(),
        startedAt: v.number(),
        lastActivity: v.number(),
      })
    ),
    version: v.string(),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    // Find existing host record
    const existing = await ctx.db
      .query("hosts")
      .withIndex("by_hostId", (q) => q.eq("hostId", args.hostId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        activeDirectories: args.activeDirectories,
        version: args.version,
        platform: args.platform,
        lastSeen: Date.now(),
      });
      return existing._id;
    } else {
      const hostId = await ctx.db.insert("hosts", {
        hostId: args.hostId,
        status: args.status,
        activeDirectories: args.activeDirectories,
        version: args.version,
        platform: args.platform,
        lastSeen: Date.now(),
      });
      return hostId;
    }
  },
});

export const heartbeat = mutation({
  args: {
    hostId: v.string(),
    activeDirectories: v.optional(
      v.array(
        v.object({
          path: v.string(),
          port: v.number(),
          pid: v.number(),
          startedAt: v.number(),
          lastActivity: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("hosts")
      .withIndex("by_hostId", (q) => q.eq("hostId", args.hostId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        lastSeen: Date.now(),
        status: "online" as const,
      };
      if (args.activeDirectories !== undefined) {
        patch.activeDirectories = args.activeDirectories;
      }
      await ctx.db.patch(existing._id, patch);
    }
  },
});

export const getStatus = query({
  args: { hostId: v.string() },
  handler: async (ctx, { hostId }) => {
    const host = await ctx.db
      .query("hosts")
      .withIndex("by_hostId", (q) => q.eq("hostId", hostId))
      .first();
    return host || null;
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    const hosts = await ctx.db
      .query("hosts")
      .withIndex("by_status", (q) => q.eq("status", "online"))
      .take(50);
    return hosts;
  },
});

export const markOffline = mutation({
  args: { hostId: v.string() },
  handler: async (ctx, { hostId }) => {
    const existing = await ctx.db
      .query("hosts")
      .withIndex("by_hostId", (q) => q.eq("hostId", hostId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "offline",
        activeDirectories: [],
        lastSeen: Date.now(),
      });
    }
  },
});
