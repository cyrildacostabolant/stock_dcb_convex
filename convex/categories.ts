// @ts-nocheck
// @ts-ignore
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("categories").collect();
  },
});

export const create = mutation({
  args: { name: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("categories", args);
  },
});

export const insertMany = mutation({
  args: { 
    categories: v.array(v.object({
      name: v.string(),
      color: v.string()
    }))
  },
  handler: async (ctx, args) => {
    for (const cat of args.categories) {
      await ctx.db.insert("categories", cat);
    }
  }
});

export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const update = mutation({
  args: { id: v.id("categories"), name: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { name: args.name, color: args.color });
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    for (const cat of categories) {
      await ctx.db.delete(cat._id);
    }
  }
});
