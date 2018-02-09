// ==UserScript==
// @name        GH Kanban (projects)
// @namespace   github.javitonino.eu
// @include     https://github.com/orgs/*/projects/*
// @include     https://github.com/*/*/projects/*
// @version     1.1.4
// @require  https://greasemonkey.github.io/gm4-polyfill/gm4-polyfill.js
// @grant    GM.getValue
// @grant    GM_getValue
// @grant    GM.setValue
// @grant    GM_setValue
// @updateURL   https://raw.githubusercontent.com/javitonino/grease/master/github.com/kanban/projects.user.js
// ==/UserScript==

var document = unsafeWindow.document;
var MILESTONE_CACHE = {};
var ISSUE_DATA_CACHE = {};
var USER_LOGIN = document.querySelector('meta[name=user-login]').getAttribute('content');
var IGNORED_COLUMNS = ['Done', 'Done in previous shifts'];
var REVIEWER_BLACKLIST = ['houndci-bot'];
var TOKEN = null;
var REVIEWS = {
  'PENDING' : { 'color': '#fbca04', text: '?' },
  'APPROVED' : { 'color': '#0e8a16', text: '✔' },
  'COMMENTED' : { 'color': '#0052cc', text: '💬' },
  'CHANGES_REQUESTED' : { 'color': '#d93f0b', text: '✖' },
  'DISMISSED' : { 'color': '#cccccc', text: 'D' },
  'OTHERS' : { 'color': '#cccccc', text: 'O' }
};

function htmlToElement(html) {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild;
}

function getIssueData(card_link, callback) {
  if (card_link === void 0) {
    return;
  }

  var cache = ISSUE_DATA_CACHE[card_link];
  if (cache) { return callback(cache); }

  var link_parts = card_link.split('/');
  var query = 'query { repository(owner: "' + link_parts[1] + '", name: "' + link_parts[2] + '") { issue(number: ' + link_parts[4] + ') {  milestone { resourcePath } timeline(first: 100) {  nodes { ... on CrossReferencedEvent {source { ... on PullRequest { number, resourcePath, reviews(last: 1) {nodes { state, author { login } } } } } } } } } } }';

  fetch(new Request('https://api.github.com/graphql', {
    headers: {
      Authorization: 'token ' + TOKEN
    },
    body: JSON.stringify({ "query": query }),
    method: 'POST'
  })).then(function(response) {
    if (response.ok) {
      response.json().then(function(data) {
        ISSUE_DATA_CACHE[card_link] = data;
        callback(data);
      });
    }
  });
}


function getMilestoneData(milestone_link, callback) {
  if (milestone_link === void 0) {
    return;
  }

  var cache = MILESTONE_CACHE[milestone_link];
  if (cache) { return callback(cache); }

  fetch(new Request('https://api.github.com/repos' + milestone_link, {
    headers: {
      Authorization: 'token ' + TOKEN
    }
  })).then(function(response) {
    if (response.ok) {
      response.json().then(function(data) {
    MILESTONE_CACHE[milestone_link] = data;
    callback(data);
      });
    }
  });
}


function assignIssue(event) {
  var menu = event.target;
  var card_link = menu.getAttribute('data-card-link');
  var action = menu.getAttribute('data-action');

  if (action == 'assign') {
    var verb = 'POST';
    menu.setAttribute('data-action', 'unassign');
    menu.innerHTML = 'Unassign myself';
  } else {
    var verb = 'DELETE';
    menu.setAttribute('data-action', 'assign');
    menu.innerHTML = 'Assign myself';
  }

  fetch(new Request('https://api.github.com/repos' + card_link + '/assignees', {
    method: verb,
    headers: {
      Authorization: 'token ' + TOKEN
    },
    body: JSON.stringify({ assignees: [USER_LOGIN] })
  }));
}


function buildReviewSpan (review) {
  var style = '';
  style += 'font-weight: 600;';
  style += 'padding-left: 2px;';
  style += 'color: ' + REVIEWS[review].color + ';';

  return htmlToElement('<span style="' + style + '">' + REVIEWS[review].text + '</span>');
}


function getPRInfoFromUrl (url) {
  var pullRegex = /github\.com\/(.*?)\/(.*?)\/pull\/(\d+)/;
  var match = url.match(pullRegex);
  if (match) {
    return {
      owner: match[1],
      repo: match[2],
      id: match[3]
    };
  }
  return null;
}


function parseReviews (data, pr) {
  var style = '';
  var comments = [];
  var review = '';

  data.forEach(function (review) {
    if (REVIEWER_BLACKLIST.indexOf(review.author.login) === -1) {
      if (comments.indexOf(review.state) === -1) {
        comments.push(review.state); // Only unique types of comments
      }
    }
  });

  if (comments.length === 1 && comments[0] === 'COMMENTED') {
    review = comments[0]; // It's only commented
  } else {
    for (var i = comments.length - 1; i >= 0 && !review; --i) {
      if (comments[i] !== 'COMMENTED') {
        review = comments[i]; // Getting the last meaningful comment that's not 'COMMENTED'
      }
    }
  }

  review = review || 'PENDING';
  pr.append(buildReviewSpan(review));
}


function addPRLinks(card) {
  if (card.getAttribute('links-loaded')) {
    return;
  } else {
    card.setAttribute('links-loaded', true);
  }

  if (!card.closest('.project-column')) { return; }
  var column = card.closest('.project-column').querySelector('.js-project-column-name').innerHTML;
  if (IGNORED_COLUMNS.includes(column)) { return; }

  var card_link = card.querySelector('a.h5') && card.querySelector('a.h5').getAttribute('href');

  if (card_link) {
    // Issue
    card.append(htmlToElement('<div class="milestone-container pl-5 p-2"></div>'));

    getIssueData(card_link, function(data) {
      if (!data.data.repository.issue) {
        return;
      }

      data.data.repository.issue.timeline.nodes.forEach(function(i) {
        if (i.source && i.source.number) {
          var url = i.source.resourcePath;
          var labels = card.querySelector('.labels');
          if (!labels) {
            labels = htmlToElement('<span class="labels d-block pb-1 pr-6"></span>');
            if (card.querySelector('.d-block.pr-6')) { card.querySelector('.d-block.pr-6').after(labels); }
          }
          var pr = htmlToElement('<a class="issue-card-label css-truncate css-truncate-target label mt-1 v-align-middle labelstyle-fbca04 linked-labelstyle-fbca04 tooltipped tooltipped-n" href="' + i.source.resourcePath + '" style="color: #4078c0; border: 1px solid #DDD; border-radius: 3px; box-shadow: none; margin-right: 3px;">#' + i.source.number + '</a>');
          labels.append(pr);

          parseReviews(i.source.reviews.nodes, pr);
        }
      });

      if (data.data.repository.issue.milestone) {
        getMilestoneData(data.data.repository.issue.milestone.resourcePath.replace("milestone", "milestones"), function(data) {
          var total_issues = data.open_issues + data.closed_issues;
          var percent = data.closed_issues / total_issues * 100;
          var progress_bar = ' background: linear-gradient(90deg, #6cc644 ' + percent + '%, #EEE ' + percent +'%)';
          card.querySelector('.milestone-container').append(htmlToElement('<div style="height: 2px; margin: 0 0 11px 0; ' + progress_bar + '"></div>'));
          card.querySelector('.milestone-container').append(htmlToElement('<a class="text-gray" style="font-size: 12px; line-height: 14px; display: block;" href="' + data.html_url + '">' + data.title + ' (' + Math.round(percent) + '%)</a>'));
        });
      }
    });
  } else {
    // Note
    var title = card.querySelector('.mr-4 p');
    var text = title.innerHTML;
    if (text.startsWith('==') && text.endsWith('==')) {
      title.innerHTML = text.replace(/=/g, '');
      card.querySelector('small').remove();
      title.setAttribute('style', 'margin-bottom: 0; font-weight: bold;');
      card.setAttribute('style', 'filter: contrast(75%);');
    }
  }
}


function addMenuOptions(card) {
  if (card.getAttribute('menu-loaded')) {
    return;
  } else {
    card.setAttribute('menu-loaded', true);
  }

  if (!card.querySelector('a.h5') || !card.querySelector('.dropdown-menu')) { return; }

  var card_link = card.querySelector('a.h5').getAttribute('href');
  var avatars = card.querySelectorAll('.avatar');

  var assignees = [];
  for (var i = 0; i < avatars.length; i++) {
    var filter = avatars[i].getAttribute('data-card-filter');
    if (filter) {
    	assignees.push(filter.split(':')[1]);
    }
  }


  var assign_button;
  if (assignees.includes(USER_LOGIN)) {
    assign_button = htmlToElement('<button class="dropdown-item text-left btn-link js-assign js-menu-close" data-action="unassign" data-card-link="' + card_link + '">Unassign myself</button>');
  } else {
    assign_button = htmlToElement('<button class="dropdown-item text-left btn-link js-assign js-menu-close" data-action="assign" data-card-link="' + card_link + '">Assign myself</button>');
  }
  card.querySelector('.dropdown-menu').prepend(assign_button);

  window.document.querySelector('#' + card.id + ' .js-assign').addEventListener('click', assignIssue);
}

(async function() {
	TOKEN = await GM.getValue('oauth_token');
  if (!TOKEN) {
    TOKEN = prompt("I need an Oauth token with the repo scope from https://github.com/settings/tokens", "");
    if (TOKEN) {
      GM.setValue('oauth_token', TOKEN);
    } else {
      return;
    }
  }

  setTimeout(function() {
    var observer = new MutationObserver(function(mutationsList) {
      for(var mutation of mutationsList) {
        var issues = document.querySelectorAll('.issue-card');
        for (var i = 0; i < issues.length; i++) {
          var card = issues[i];
          addPRLinks(card);
          addMenuOptions(card);
        }
      }
    });
    var columns = document.querySelectorAll('.js-project-column-cards');
    for (var i = 0; i < columns.length; i++) {
      observer.observe(columns[i], { childList: true, attributes: false, characterData: false, subtree: true });
    }

    var issues = document.querySelectorAll('.issue-card');
    for (var i = 0; i < issues.length; i++) {
      var card = issues[i];
      addPRLinks(card);
      addMenuOptions(card);
    }
  }, 1000);
})();
