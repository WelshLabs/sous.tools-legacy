import { Injectable, OnApplicationShutdown, Logger } from "@nestjs/common";
import neo4j, { Driver } from "neo4j-driver";
import { serverConfig as config } from "@soustools/config/server";

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  private readonly logger = new Logger(Neo4jService.name);
  private readonly driver: Driver;

  constructor() {
    let uri = config.NEO4J_URI;
    // Normalize container hostname port mapping: inside docker network,
    // neo4j listens on 7687 (7688 is the host port forwarding).
    if (uri && uri.includes("neo4j:7688")) {
      uri = uri.replace("neo4j:7688", "neo4j:7687");
    }

    this.logger.log(
      `Initializing Neo4j connection to ${uri} as user ${config.NEO4J_USERNAME}`,
    );
    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
    );
  }

  /**
   * Executes a Cypher query in a write transaction and returns the result.
   */
  async runQuery(query: string, params?: Record<string, any>): Promise<any> {
    const session = this.driver.session();
    try {
      return await session.executeWrite((tx) => tx.run(query, params));
    } catch (error) {
      this.logger.error(
        `Failed to execute Cypher query: ${query}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Returns the raw Neo4j driver instance.
   */
  getDriver(): Driver {
    return this.driver;
  }

  /**
   * Closes the Neo4j driver connection gracefully on application shutdown.
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log("Closing Neo4j driver connection");
    await this.driver.close();
  }
}
