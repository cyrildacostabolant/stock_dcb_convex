// @ts-nocheck
// @ts-ignore
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stocks").collect();
  },
});

export const create = mutation({
  args: { produit: v.string(), quantite: v.number(), categorie: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("stocks", args);
  },
});

export const insertMany = mutation({
  args: { 
    stocks: v.array(v.object({
      produit: v.string(),
      quantite: v.number(),
      categorie: v.string()
    }))
  },
  handler: async (ctx, args) => {
    for (const stock of args.stocks) {
      await ctx.db.insert("stocks", stock);
    }
  }
});

export const updateQuantity = mutation({
  args: { id: v.id("stocks"), quantite: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { quantite: args.quantite });
  },
});

export const update = mutation({
  args: { id: v.id("stocks"), produit: v.string(), quantite: v.number(), categorie: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { produit: args.produit, quantite: args.quantite, categorie: args.categorie });
  },
});

export const remove = mutation({
  args: { id: v.id("stocks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const stocks = await ctx.db.query("stocks").collect();
    for (const stock of stocks) {
      await ctx.db.delete(stock._id);
    }
  }
});
