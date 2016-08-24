# jira-link-tickets-from-git-commits

Links all jira-issues found in git commits since a given git tag to a specified jira ticket. In our usecase, a release-ticket needs to be linked to every commited jira issue.

Prerequisites: node 5+ and git 2.5+ must be available globally

# Usage

    # you may define your settings upfront, so you don't need to provide them
    export JIRA_USER=youmail.whatever@mail.at
    export JIRA_PASS=yoursecretpassword

    # long format
    ./jira-commit-linker.js --tag v1.7.0 --path ../projectfolder --releaseissue FOO-2560
    # short
    ./jira-commit-linker.js -t v1.7.0 -p ../projectfolder -r FOO-2560

# Compatibility

developed and tested on mac os 10.10, git 2.5.4, node 5.10.1, npm 3.8.3
