#!/usr/bin/env node
import {crossEnv} from "cross-env";

import {IHelpObject, processArguments, VersionsExtractor} from "../index.js";

let args: IHelpObject = processArguments();
let extractor: VersionsExtractor = new VersionsExtractor(args);

async function main()
{
    try
    {
        const result = await extractor.process();
    
        console.log(`
Branch name is '${result.branchName}'
Branch prefix is '${result.branchPrefix}'
Branch version is '${result.branchVersion}'
Last matching version is '${result.lastMatchingVersion}'
Computed version is '${result.version}'`);
    
        if(result.executeCommand)
        {
            crossEnv([`GIT_VERSION=${result.version}`, result.executeCommand], {shell: true});
        }
    }
    catch(reason)
    {
        console.error(`Processing failed: '${reason}'!`);

        process.exit(-1);
    }
}

main();
