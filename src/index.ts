import * as git from "simple-git";
import * as commandLineArgs from "command-line-args";
import commandLineUsage = require("command-line-usage");
import {UsageOptionDefinition} from 'command-line-usage-options';

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
    suffix?: string;
    currentVersion?: string;
}

/**
 * Process arguments and returns parsed object
 */
export function processArguments(): IHelpObject
{
    let definitions: UsageOptionDefinition[] =
    [
        { name: "help", alias: "h", type: Boolean, description: "Displays help for this command line tool." },
        { name: "branchName", type: String, description: "Name of branch used for getting version, if not specified current branch will be used, if detached error will be thrown.", typeLabel: "<branchName>", defaultOption: true },
        { name: "buildNumber", alias: "b", type: Number, description: "Build number will be used if suffix is specified, defaults to 0.", typeLabel: "<buildNumber>" },
        { name: "tagPrefix", alias: "t", type: String, description: "Tag prefix (RegExp) used for pairing branch and tag for getting version. Defaults to 'v'", typeLabel: "<prefix>", defaultValue: "v" },
        { name: "ignoreBranchPrefix", alias: "i", type: String, description: "Branch prefix name that will be ignored (RegExp) and stripped of branch during version paring.", typeLabel: "<ignorePrefix>" },
        { name: "pre", alias: "p", type: Boolean, description: "Indication that prerelease version should be returned.", defaultValue: false },
        { name: "suffix", alias: "s", type: String, description: "Suffix that is used when prerelease version is requested, will be used as prerelease (suffix) name.", typeLabel: "<suffix>" },
        { name: "currentVersion", alias: "v", type: String, description: "Current version that will be used if it matches branch and tag as source for next version.", typeLabel: "<version>" }
    ];

    let args: IHelpObject = commandLineArgs(definitions);

    if(args.help)
    {
        console.log(commandLineUsage(
        [
            {
                header: "description",
                content:
                [
                    "Gets version of application based on branch name and existing tags",
                    "",
                    "Command:",
                    "ngv <branchName> [options]"
                ]
            },
            {
                header: "options",
                optionList: definitions
            }
        ]));

        process.exit(0);
    }

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
    private _git: git.Git;

    /**
     * Resolve method for process method
     */
    private _processResolve: (value: VersionsExtractor) => void;

    /**
     * Reject method for process method
     */
    private _processReject: (reason: any) => void;

    /**
     * Name of current branch
     */
    private _branchName: string;

    //######################### constructor #########################
    constructor(private _config: IHelpObject)
    {
        //Tests whether application is run inside git repository
        this._git = git().status(error =>
        {
            if(error)
            {
                console.log(error);

                process.exit(-1);
            }
        });
    }

    //######################### public methods #########################

    /**
     * Process extraction of version
     */
    public process(): Promise<VersionsExtractor>
    {
        this._runProcessing();

        return new Promise((resolve, reject) =>
        {
            this._processResolve = resolve;
            this._processReject = reject;
        });
    }

    //######################### private methods #########################

    /**
     * Runs internal git processing
     */
    private async _runProcessing()
    {
        this._branchName = await this._getBranchName();

        this._processResolve(this);
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

        return new Promise<string>((resolve) =>
        {
            this._git.branch(this._errorHandle(result =>
            {
                if(result.detached)
                {
                    this._processReject("Unable to proceed if 'HEAD' is detached and no 'branchName' was specified!");

                    return;
                }

                resolve(result.current);
            }));
        });
    }

    /**
     * Creates handle function with automatic error handling
     * @param callback Callback called if result was success
     */
    private _errorHandle(callback: (result: any) => void): (error: any, result: any) => void
    {
        return (error: any, result: any) =>
        {
            if(error)
            {
                this._processReject(error);

                return;
            }

            callback(result);
        };
    }
}