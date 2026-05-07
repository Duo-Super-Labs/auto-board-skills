#!/usr/bin/env node
import { Command } from "commander";
import { registerAgentSetEnv } from "./commands/agent-set-env.js";
import { registerBootstrap } from "./commands/bootstrap.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerIssueCreate } from "./commands/issue-create.js";
import { registerNewProduct } from "./commands/new-product.js";
import { registerProvision } from "./commands/provision.js";
import { registerStack } from "./commands/stack.js";

const program = new Command();

program
  .name("auto-board")
  .description(
    "CLI for the auto-board SDLC pipeline on top of Multica self-hosted.\n" +
      "  Server: https://desktop-76n2ggj.tailda7706.ts.net\n" +
      "  Docs:   https://github.com/Duo-Super-Labs/auto-board-skills"
  )
  .version("0.1.0");

// Register all commands
registerDoctor(program);
registerNewProduct(program);
registerProvision(program);
registerBootstrap(program);
registerStack(program);
registerAgentSetEnv(program);
registerIssueCreate(program);

program.parse();
