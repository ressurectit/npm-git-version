#!/usr/bin/env node

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
    })
    .catch(reason =>
    {
        console.error(`Processing failed: '${reason}'!`);

        process.exit(-1);
    });

