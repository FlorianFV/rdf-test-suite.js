import {RdfObjectLoader, Resource} from "rdf-object";
import {termToString} from "rdf-string";
import {IManifest, manifestFromResource} from "./IManifest";
import {ITestCase} from "./testcase/ITestCase";
import {ITestCaseHandler} from "./testcase/ITestCaseHandler";
import {TestCaseXmlEvalHandler} from "./testcase/rdfsyntax/xml/TestCaseXmlEval";
import {TestCaseXmlNegativeSyntaxHandler} from "./testcase/rdfsyntax/xml/TestCaseXmlNegativeSyntax";
import {TestCaseNegativeSyntaxHandler} from "./testcase/sparql/TestCaseNegativeSyntax";
import {TestCasePositiveSyntaxHandler} from "./testcase/sparql/TestCasePositiveSyntax";
import {TestCaseQueryEvaluationHandler} from "./testcase/sparql/TestCaseQueryEvaluation";
import {TestCaseUnsupportedHandler} from "./testcase/TestCaseUnsupported";
import {Util} from "./Util";

/**
 * A ManifestLoader loads test suites from URLs.
 */
export class ManifestLoader {

  public static readonly DEFAULT_TEST_CASE_HANDLERS: {[uri: string]: ITestCaseHandler<ITestCase<any>>} =
    require('./testcase/TestCaseHandlers');
  public static readonly LOADER_CONTEXT = require('./context-manifest.json');

  private readonly testCaseHandlers: {[uri: string]: ITestCaseHandler<ITestCase<any>>};

  constructor(args?: IManifestLoaderArgs) {
    if (!args) {
      args = {};
    }
    this.testCaseHandlers = args.testCaseHandlers || ManifestLoader.DEFAULT_TEST_CASE_HANDLERS;
  }

  /**
   * Load the manifest from the given URL.
   * @param {string} url The URL of a manifest.
   * @param {string} cachePath The base directory to cache files in. If falsy, then no cache will be used.
   * @return {Promise<IManifest>} A promise that resolves to a manifest object.
   */
  public async from(url: string, cachePath?: string): Promise<IManifest> {
    const objectLoader = new RdfObjectLoader({ context: ManifestLoader.LOADER_CONTEXT });
    await this.import(objectLoader, url, cachePath);
    const manifestResource: Resource = objectLoader.resources[url];
    if (!manifestResource) {
      throw new Error(`Could not find a resource ${url} in the document at ${url}`);
    }
    return manifestFromResource(this.testCaseHandlers, cachePath, manifestResource);
  }

  protected async import(objectLoader: RdfObjectLoader, urlInitial: string, cachePath?: string): Promise<void> {
    const [url, parsed] = await Util.fetchRdf(urlInitial, cachePath);

    // Dereference the URL and load it
    try {
      await objectLoader.import(parsed);
    } catch (e) {
      console.error(new Error(`Failed to parse manifest at ${url}`).toString());
      return;
    }

    // Import all sub-manifests
    const manifest = objectLoader.resources[url];
    const includeJobs: Promise<void>[] = [];
    for (const includeList of manifest.properties.include) {
      for (const include of includeList.list) {
        if (include.term.termType !== 'NamedNode') {
          throw new Error(`Found invalid manifest term ${termToString(include.term)} when parsing ${url}`);
        }
        includeJobs.push(this.import(objectLoader, include.value, cachePath));
      }
    }
    await Promise.all(includeJobs);
  }

}

export interface IManifestLoaderArgs {
  testCaseHandlers?: {[uri: string]: ITestCaseHandler<ITestCase<any>>};
}