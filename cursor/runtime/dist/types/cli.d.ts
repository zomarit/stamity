#!/usr/bin/env node
import { type CommandModule } from "./cli/kit/program.ts";
export declare const COMMANDS: readonly CommandModule[];
export declare function assertUniqueCommandNames(commands: readonly CommandModule[]): void;
