import neo4j from "neo4j-driver";
import * as dotenv from "dotenv";

// Load environment variables to ensure portability across your 3-Environment Map
dotenv.config();

// Pull credentials from the environment, with fallbacks for your local setup
const URI = process.env.NEO4J_URI || "bolt://neo4j:7687";
const USER = process.env.NEO4J_USERNAME || "neo4j";
const PASSWORD = process.env.NEO4J_PASSWORD || "sousToolsPassword";
console.log("URI", URI);
async function nukeDatabase() {
  console.log(`🔌 Connecting to Neo4j at ${URI}...`);

  // Initialize the Neo4j driver
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    console.log("🔥 Initiating complete graph deletion (Nuke)...");

    // The Cypher query to instantly delete every node and relationship
    const result = await session.run("MATCH (n) DETACH DELETE n;");

    console.log(`✅ Neo4j graph successfully nuked. Blank slate achieved.`);
  } catch (error) {
    console.error(
      "❌ Failed to nuke Neo4j database. Is the container running?",
    );
    console.error(error);
    process.exit(1); // Force the npm script to fail so Supabase doesn't seed a broken graph
  } finally {
    // Always cleanly close the session and driver
    await session.close();
    await driver.close();
  }
}

nukeDatabase();
