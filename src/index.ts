import {SimpleGit, simpleGit} from "simple-git";
import semver from "semver";
import path from 'path';
import fs from 'fs';
import {hideBin} from 'yargs/helpers';
import yargs from 'yargs';

import {ReleaseType} from 'semver';

/**
 * Reads configuration from ENV variables
 */
function processEnvCfg(): IHelpObject
{
    let result: IHelpObject =
    {
        config: 'ngv.config.json'
    };

    if(process.env.NGV_BRANCH_NAME)
    {
        result.branchName = process.env.NGV_BRANCH_NAME;
    }

    if(process.env.NGV_BUILD_NUMBER)
    {
        result.buildNumber = parseInt(process.env.NGV_BUILD_NUMBER!);
    }

    if(process.env.NGV_TAG_PREFIX)
    {
        result.tagPrefix = process.env.NGV_TAG_PREFIX;
    }

    if(process.env.NGV_IGNORE_BRANCH_PREFIX)
    {
        result.ignoreBranchPrefix = process.env.NGV_IGNORE_BRANCH_PREFIX;
    }

    if(process.env.NGV_PRE)
    {
        result.pre = process.env.NGV_PRE!.toLowerCase() == "true";
    }

    if(process.env.NGV_SUFFIX)
    {
        result.suffix = process.env.NGV_SUFFIX;
    }

    if(process.env.NGV_WORKING_DIRECTORY)
    {
        result.workingDirectory = process.env.NGV_WORKING_DIRECTORY;
    }

    if(process.env.NGV_CURRENT_VERSION)
    {
        result.currentVersion = process.env.NGV_CURRENT_VERSION;
    }

    if(process.env.NGV_NO_INCREMENT)
    {
        result.noIncrement = process.env.NGV_NO_INCREMENT!.toLowerCase() == "true";
    }

    if(process.env.NGV_NO_STDOUT)
    {
        result.noStdOut = process.env.NGV_NO_STDOUT!.toLowerCase() == "true";
    }

    if(process.env.NGV_EXECUTE)
    {
        result.execute = process.env.NGV_EXECUTE;
    }

    return result;
}

/**
 * Description of help parameters
 */
export interface IHelpObject
{
    help?: boolean;
    branchName?: string;
    buildNumber?: number;
    tagPrefix?: string;
    ignoreBranchPrefix?: string;
    pre?: boolean;
    suffix?: string;
    currentVersion?: string;
    noIncrement?: boolean;
    workingDirectory?: string;
    noStdOut?: boolean;
    config: string;
    execute?: string;
}

/**
 * Updates build number, handling special build number -1
 * @param args - Arguments that are being processed
 */
export function updateBuildNumber(args: IHelpObject)
{
    if(args.buildNumber == -1)
    {
        args.buildNumber = parseInt((new Date()).toISOString().replace(/[^0-9]/g, '').slice(0, -3));
    }
}

/**
 * Process arguments and returns parsed object
 */
export function processArguments(): IHelpObject
{
    let args: IHelpObject = yargs(hideBin(process.argv))
        .command('$0 [branchName]', 'Gets version of application based on branch name and existing tags', (yargs) =>
        {
            yargs
                .positional('branchName',
                    {
                        description: 'Name of branch used for getting version, if not specified current branch will be used, if detached error will be thrown.',
                        type: 'string',
                    })
                .options(
                    {
                        'branchName': {
                            type: 'string',
                        },
                        'buildNumber': {
                            alias: 'b',
                            type: 'number',
                            description: 'Build number will be used if suffix is specified, defaults to 0, possible to use -1 to autogenerate date time stamp.'
                        },
                        'tagPrefix': {
                            alias: 't',
                            type: 'string',
                            description: 'Tag prefix (RegExp) used for pairing branch and tag for getting version.'
                        },
                        'ignoreBranchPrefix': {
                            alias: 'i',
                            type: 'string',
                            description: 'Branch prefix name that will be ignored (RegExp) and stripped of branch during version paring.'
                        },
                        'pre': {
                            alias: 'p',
                            type: 'boolean',
                            description: 'Indication that prerelease version should be returned.'
                        },
                        'suffix': {
                            alias: 's',
                            type: 'string',
                            description: 'Suffix that is used when prerelease version is requested, will be used as prerelease (suffix) name.'
                        },
                        'currentVersion': {
                            alias: 'v',
                            type: 'string',
                            description: 'Current version that will be used if it matches branch and tag as source for next version.'
                        },
                        'noIncrement': {
                            alias: 'r',
                            type: 'boolean',
                            description: 'Indication whether no new version should be incremented/calculated.'
                        },
                        'workingDirectory': {
                            alias: 'w',
                            type: 'string',
                            description: 'Working directory where git repository is located.'
                        },
                        'noStdOut': {
                            alias: 'n',
                            type: 'boolean',
                            description: 'Indication that no stdout should be written in case of success run.'
                        },
                        'config': {
                            alias: 'c',
                            type: 'string',
                            description: 'Path to configuration file.'
                        },
                        'execute': {
                            alias: 'e',
                            type: 'string',
                            description: 'Execute command with variable \'$GIT_VERSION\' available.'
                        },
                    });
        })
        .strict()
        .alias('h', 'help')
        .help()
        .version()
        .parse() as unknown as IHelpObject;

    let envConfig = processEnvCfg();
    let fileConfig = {};
    let configPath = path.join(process.cwd(), envConfig.config);

    if(fs.existsSync(configPath))
    {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    else
    {
        if(!args.noStdOut)
        {
            console.log(`No config file '${envConfig.config}' found.`);
        }
    }

    args = 
    {
        ...fileConfig,
        ...envConfig,
        ...args,
    };

    updateBuildNumber(args);

    return args;
}

/**
 * Extractor that extracts version number for current git repository
 */
export class VersionsExtractor
{
    //######################### private fields #########################

    /**
     * Instance of git wrapper
     */
    private _git?: SimpleGit;

    /**
     * Name of current branch
     */
    private _branchName?: string;

    /**
     * Name of current branch stripped only to version
     */
    private _branchVersion?: string;

    /**
     * Stripped branch prefix from branch name
     */
    private _branchPrefix: string = "";

    /**
     * Number of last matching version
     */
    private _lastMatchingVersion?: string;

    /**
     * Indication that tag is on current HEAD
     */
    private _currentTag: boolean = false;

    /**
     * Indication that version is new for this branch
     */
    private _startingVersion: boolean = false;

    /**
     * Computed version for next build
     */
    private _version?: string;

    //######################### private properties #########################

    /**
     * Gets safely git instance
     */
    private get git(): SimpleGit
    {
        if(!this._git)
        {
            throw new Error('Missing simple git!');
        }

        return this._git;
    }

    //######################### public properties #########################

    /**
     * Gets stripped branch prefix from branch name
     */
    public get branchPrefix(): string
    {
        return this._branchPrefix;
    }

    /**
     * Gets name of current branch
     */
    public get branchName(): string
    {
        if(!this._branchName)
        {
            throw new Error('Missing _branchName!');
        }

        return this._branchName;
    }

    /**
     * Gets name of current branch stripped only to version
     */
    public get branchVersion(): string
    {
        if(!this._branchVersion)
        {
            throw new Error('Missing _branchVersion!');
        }

        return this._branchVersion;
    }

    /**
     * Gets computed version for next build
     */
    public get version(): string
    {
        if(!this._version)
        {
            throw new Error('Missing _version!');
        }

        return this._version;
    }

    /**
     * Gets number of last matching version
     */
    public get lastMatchingVersion(): string
    {
        if(!this._lastMatchingVersion)
        {
            throw new Error('Missing _lastMatchingVersion!');
        }

        return this._lastMatchingVersion;
    }

    /**
     * Command that should be executed after version is computed
     */
    public get executeCommand(): string|undefined
    {
        return this._config.execute;
    }

    //######################### private properties #########################

    /**
     * Gets prerelease suffix
     */
    private get prereleaseSuffix(): string
    {
        if(this._config.pre)
        {
            return `${this._branchPrefix ? this._branchPrefix + "-" : ""}${this._config.suffix}`;
        }

        return "";
    }

    //######################### constructor #########################
    constructor(private _config: IHelpObject)
    {
        if(this._config.pre && !this._config.suffix)
        {
            console.error("Prerelease version was set, but no suffix was provided!");

            process.exit(-1);
        }
    }

    //######################### public methods #########################

    /**
     * Process extraction of version
     */
    public async process(): Promise<VersionsExtractor>
    {
        this._git = simpleGit(this._config.workingDirectory)
        //Tests whether application is run inside git repository
        await this._git.status();

        if(!this._config.noStdOut)
        {
            console.log("Git repository available.");
        }

        await this._runProcessing();

        return this;
    }

    //######################### private methods #########################

    /**
     * Runs internal git processing
     */
    private async _runProcessing()
    {
        this._branchName = await this._getBranchName();
        this._processBranchName();
        this._lastMatchingVersion = await this._getLastMatchingTag();
        this._computeVersion();
        this._applyBuildNumber();
    }

    /**
     * Applies specified build number for prerelease version
     */
    private _applyBuildNumber(): void
    {
        //release version or current tag is on same commit as HEAD
        if(!this._config.pre || this._currentTag || this._config.noIncrement)
        {
            return;
        }

        //no build number or current version
        if(!this._config.buildNumber && !this._config.currentVersion)
        {
            return;
        }

        //build number higher priority
        if(this._config.buildNumber)
        {
            this._version = this._version?.replace(/\d+$/g, `${this._config.buildNumber}`);

            return;
        }

        //current version specified as parameter
        if(this._config.currentVersion)
        {
            let currentVersionSemver = semver.parse(this._version);
            let originalVersionSemver = semver.parse(this._config.currentVersion);

            //invalid one of versions
            if(!currentVersionSemver || !originalVersionSemver)
            {
                throw new Error(`Unable to parse version '${this._version}' or '${this._config.currentVersion}'!`);
            }

            //version are in match use it as base for increment
            if(`${currentVersionSemver.major}.${currentVersionSemver.minor}.${currentVersionSemver.patch}-${currentVersionSemver.prerelease[0]}` == `${originalVersionSemver.major}.${originalVersionSemver.minor}.${originalVersionSemver.patch}-${originalVersionSemver.prerelease[0]}`)
            {
                this._version = semver.inc(this._config.currentVersion, "prerelease", false, this.prereleaseSuffix) as string;
            }
        }
    }

    /**
     * Computes next version for build
     */
    private _computeVersion(): void
    {
        //use current version without change
        if(this._config.currentVersion && this._config.noIncrement)
        {
            this._version = this._config.currentVersion;

            return;
        }

        //commit and matching tag are same, always use release version
        if(this._currentTag)
        {
            this._version = this._lastMatchingVersion;

            return;
        }

        //new version for current branch, first for current major.minor number
        if(this._startingVersion)
        {
            if(this._config.pre)
            {
                this._version = `${this._lastMatchingVersion}-${this.prereleaseSuffix}.0`;
            }
            else
            {
                this._version = this._lastMatchingVersion;
            }

            return;
        }

        //version will not be incremented
        if(this._config.noIncrement)
        {
            return;
        }

        let version: ReleaseType = this._config.pre ? "prerelease" : "patch";
        this._version = semver.inc(this.lastMatchingVersion, version, false, this.prereleaseSuffix) as string;
    }

    /**
     * Processes branch name and extracts prefix and pure version number
     */
    private _processBranchName()
    {
        this._branchVersion = this._branchName;

        //no prefix and wrong format
        if(!this._config.ignoreBranchPrefix && !/^\d+\.\d+$/g.test(this.branchName))
        {
            throw new Error(`Wrong branch name '${this._branchName}', no prefix specified and branch is not in correct format!`);
        }

        let regex = new RegExp(`^${this._config.ignoreBranchPrefix}`, 'gi');
        let matches = regex.exec(this.branchName);

        //prefix present
        if(matches)
        {
            this._branchPrefix = matches[0].replace(/\/$/g, '');
            this._branchVersion = this.branchName.replace(regex, '');
        }

        //after prefix strip still wrong format
        if(!/^\d+\.\d+$/g.test(this.branchVersion))
        {
            throw new Error(`Wrong branch name '${this._branchName}', probably wrong prefix regex, extracted version '${this._branchVersion}' is not ok!`);
        }
    }

    /**
     * Gets last matching tag
     */
    private async _getLastMatchingTag(): Promise<string>
    {
        //gets all tags
        let result = await this.git.raw([
                                            'log',
                                            '--pretty="%D"',
                                            '--tags',
                                            '--no-walk',
                                        ]);

        result = result ?? '';

        //splits string into array of decorated revisions names
        const tmpArray = result.split('\n')
            .filter(itm => itm)
            .map(itm => itm.replace(/^"|"$/g, ''));

        let resultArray = tmpArray;

        //current HEAD is on commit with existing old tag
        if(tmpArray.some(itm => itm.startsWith('HEAD')))
        {
            resultArray = [];

            for(let x of tmpArray.reverse())
            {
                resultArray.push(x);

                if(x.startsWith('HEAD'))
                {
                    resultArray.reverse();

                    break;
                }
            }
        }

        //get array of tag names
        let tags = resultArray
            .map(itm => itm.replace(/^.*?tag:\s?(.*?)(?:$|,.*)/g, '$1'))
            .filter(itm => itm);

        for(let x = 0; x < tags.length; x++)
        {
            let matches = new RegExp(`^${this._config.tagPrefix}(${this._branchVersion}.*?)$`, 'gi')
                .exec(tags[x]);

            //tag and branch match
            if(matches)
            {
                const [, match] = matches;

                const tagFirst = (await this.git.raw([
                                                         "rev-list",
                                                         "-n",
                                                         "1",
                                                         tags[x]
                                                     ])).trim();

                const tagSecond = (await this.git.revparse([
                                                               "HEAD"
                                                           ])).trim();

                if(tagFirst == tagSecond)
                {
                    this._currentTag = true;
                }

                return match;
            }
        }

        this._startingVersion = true;

        return `${this._branchVersion}.0`;

    }

    /**
     * Gets requested branch name
     */
    private async _getBranchName(): Promise<string>
    {
        if(this._config.branchName)
        {
            return this._config.branchName;
        }

        const result = await this.git.branch();
        
        if(result.detached)
        {
            throw new Error("Unable to proceed if 'HEAD' is detached and no 'branchName' was specified!");
        }

        return result.current;
    }
}