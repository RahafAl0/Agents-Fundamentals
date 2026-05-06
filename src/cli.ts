#!/usr/bin/env node
import "dotenv/config";
import React from "react";
import { render } from "ink";
import { initializeLaminar } from "./observability/laminar.ts";
import { App } from "./ui/index.tsx";

initializeLaminar();

render(React.createElement(App));
