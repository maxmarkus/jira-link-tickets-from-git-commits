#!/usr/bin/env node
"use strict";

/**
 * 
 * links tickets which were commited since 
 * a given git tag to a specified (release) ticket.
 *
 * node and git must be available globally
 * 
 * manual install:
 * npm install async lodash prompt jira-client yargs
 *
 * you may define your settings upfront, so you don't need to provide them
 * export JIRA_USER=youmail.whatever@mail.at
 * export JIRA_PASS=yoursecretpassword
 * 
 *
 * tested on mac os 10.10, git 2.5.4, node 5.10.1, npm 3.8.3
 */

// =================== SETTINGS ===================

const jiraLinkIssueTypeName = "Release Decision"; // You can get a list via GET /rest/api/2/issueLinkType on your jira

let jiraSettings = {
  protocol: 'https',
  host: 'jira.hybris.com',
  apiVersion: '2',
  strictSSL: true
};

// ===============================================















// ===============================================

const async = require('async');
const _ = require('lodash');
const prompt = require('prompt');
const JiraApi = require('jira-client');
const yargs = require('yargs');
const jiraMatcher = /\d+-[A-Z]+(?!-?[a-zA-Z]{1,10})/g; // https://answers.atlassian.com/questions/325865/regex-pattern-to-match-jira-issue-key
let jira, createQueue;


let argv = yargs.usage('Usage: $0 [options]')

.demand('tag')
.alias('tag', 't')
.nargs('tag', 1)
.describe('tag', 'Tag which is used to get list of tickets')

.demand('releaseticket')
.alias('releaseticket', 'r')
.nargs('releaseticket', 1)
.describe('releaseticket', 'Target release-ticket id (FOO-0000) where links are being created')

.demand('path')
.alias('path', 'p')
.nargs('path', 1)
.describe('path', 'Path to project base directory')

// no demand, .prompt takes care of that
.describe('jirauser', 'Jira Username (prompted, if not given or defined by export JIRA_USER=your.email@something.com)')
.describe('jirapass', 'Jira Password (prompted, if not given or defined by export JIRA_PASS=123456)')


.describe('dry', 'Dry run (do not link)')

.example('$0 -t FOO-0000 -t v1.5.0  --dry', 'links all found tickets since git tag v1.5.0, --dry prevents linking and just shows the tickets that would get linked')

.help('help')
.alias('help', 'h')

.argv;

/**
 * password prompt overrides and schema
 */
if(process.env.JIRA_USER){
    argv.jirauser = process.env.JIRA_USER;
}
if(process.env.JIRA_PASS){
    argv.jirapass = process.env.JIRA_PASS;
}
prompt.override = argv;
prompt.start();

var promptSchema = {
    properties: {
      jirauser: {
        hidden: false,
        required: true
      },
      jirapass: {
        hidden: true,
        required: true
      }
  }
};

const createEntityProcessed = function(err, res){
    if(err){
        console.log('Error createEntitiesProcessed', err, res);
        return;
    }
};
const execSync = (command) => {
    // console.log('==> execSync', command); // debug output
    const res = require('child_process').execSync(command, { 
        cwd: argv.p ? argv.p : '.' // set command execution path
    });
    let plainResult = res.toString().split(/\r\n|\r|\n/g); // split by newlines
    return _.filter(plainResult, (item) => item !== ''); // filter empty lines
};

const getTimeStampFromTagName = (tag, cb) => {
    const tags = execSync('git tag').reverse(); // , {stdio:[0,1,2]}
    let tagsBack = tags.indexOf(tag) + 1; // raise the index by one
    
    if(tagsBack !== -1){
        const tagInfo = execSync("git for-each-ref --sort='-*committerdate' --format=\"%(*committerdate:iso) (tag: %(refname:short))\" refs/tags --count="+tagsBack);
        let timestamp = tagInfo.pop().split(' (tag:')[0];
        return Promise.resolve(timestamp.trim());
    }
    Promise.reject('Tag '+tag+' not found in tags: ' + tags.join(', '));
};

const getCommitsSinceTimestamp = (timestamp) => {
    return execSync('git log --pretty="%s\r%n" --since="'+timestamp+'"');
};

const extractAndUnifyIssueNumbers = (inputArrOfStrings) => {
    return _.uniq(inputArrOfStrings.map((str) => {
        let ret = false;
        let s = [...str].reverse().join('');
        var m = s.match(jiraMatcher);
        if(m){
            ret = [...m[0], m[1]].reverse().join('');
            if(ret.length > 12) { 
                // some are falsy like '4432-TKMYYMKT-2344' instead of 'YMKT-2344', no clue why
                ret = ret.substr(ret.length / 2);
            }
            return ret;
        }
        return ret; // str.match(issuePrefixRegex);
    })
    .filter((str) => str !== false));
};

const getLinkedIssuesFromTicket = (issueNumber) => {

    if(!issueNumber){
        console.log('invalid releaseticket param', issueNumber);
        return;
    }
    
    const processLinkedIssues = (issue) => {
        const linkedIssues = issue.fields.issuelinks.map((obj) => {
            return obj.inwardIssue && obj.inwardIssue.key;
        });
        return linkedIssues;
    };

    return jira.findIssue(issueNumber)
      .then(processLinkedIssues)
      .catch(err => {
        console.error(err);
      });    
};

const initJira = () => {
    jiraSettings.username = argv.jirauser;
    jiraSettings.password = argv.jirapass;
    jira = new JiraApi(jiraSettings);

    // console.log('=== list of jira class functions', Object.keys(jira));
    // for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(jira))) {
    //     let method = jira[name];
    //     // Supposedly you'd like to skip constructor
    //     if (!(method instanceof Function)) { continue; }
    //     console.log(method, name);
    // }
};

const linkIssue = (issue, cb) => {
    if(argv.dry){
        console.log('DRY: not linked', issue);
        return cb();
    }
    let newIssue = {
        "type": {
            "name": jiraLinkIssueTypeName
        },
        "outwardIssue": {
            "key": argv.releaseticket
        },
        "inwardIssue": {
            "key": issue
        }
        // ,
        // "comment": {
        //     "body": "Linked related issue!",
        //     "visibility": {
        //         "type": "group",
        //         "value": "jira-users"
        //     }
        // }
    };
    
    jira.issueLink(newIssue).
        then((err, res) => {
            console.log('created', issue);
            cb();
        })
        .catch(err => { console.error('Error creating '+ issue, err.statusCode, err.name, err.message, err.error); cb(); });
};


const handleError = (err) => {
    console.error('Error occured:', err.name, err.message, err.error);
};

const runApplication = function(err, result) {

    // map prompt arguments to argv
    for(var i in result){
        if(result.hasOwnProperty(i)){
            argv[i] = result[i];
        }
    }   
    
    createQueue = async.queue(linkIssue, 1); // 2nd parameter, number of concurrent actions
    createQueue.drain = function(){
        console.log('Issue linking finished.');
    };

    let commitIssues;
    console.info('===========');
    console.info('Getting local commits from tag', argv.tag);
    getTimeStampFromTagName(argv.tag)
    .then(timestamp => {
        
        const commitsSinceTag = getCommitsSinceTimestamp(timestamp);
        commitIssues = extractAndUnifyIssueNumbers(commitsSinceTag);
        console.log('All release issues: ', commitIssues.length);
        return commitIssues;
    })
    .then(commitIssues => {
        initJira();
        return getLinkedIssuesFromTicket(argv.releaseticket);
    })
    .then(linkedIssues => {
        let notLinkedIssues = commitIssues.filter(issue => linkedIssues.indexOf(issue)===-1);
        return notLinkedIssues;
    })
    .then(notLinkedIssues => {
        // now link the missing ones
        console.log('Issues not yet linked: ' + notLinkedIssues.length);
        console.info('===========');
        notLinkedIssues.forEach(issue => {
            createQueue.push(issue, createEntityProcessed);
        });
    })        
    .catch(handleError);

};
prompt.get([promptSchema], runApplication);
