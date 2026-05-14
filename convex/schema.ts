import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categories: defineTable({
    name: v.string(),
    color: v.string(),
  }),
  stocks: defineTable({
    produit: v.string(),
    quantite: v.number(),
    categorie: v.string(),
  }),
});
