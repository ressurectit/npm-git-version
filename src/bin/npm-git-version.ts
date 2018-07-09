#!/usr/bin/env node
import * as crossEnv from "cross-env";

import {IHelpObject, processArguments, VersionsExtractor} from "../index";

let args: IHelpObject = processArguments();
let extractor: VersionsExtractor = new VersionsExtractor(args);

extractor.process()
    .then(extractor => 
    {
        console.log(`
Branch name is '${extractor.branchName}'
Branch prefix is '${extractor.branchPrefix}'
Branch version is '${extractor.branchVersion}'
Last matching version is '${extractor.lastMatchingVersion}'
Computed version is '${extractor.version}'`);

        if(extractor.executeCommand)
        {
            crossEnv([`GIT_VERSION=${extractor.version}`, extractor.executeCommand], {shell: true});
        }
    })
    .catch(reason =>
    {
        console.error(`Processing failed: '${reason}'!`);

        process.exit(-1);
    });

