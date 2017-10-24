// ==UserScript==
// @name        GH Kanban (projects)
// @namespace   github.javitonino.eu
// @include     https://github.com/orgs/*/projects/*
// @include     https://github.com/*/*/projects/*
// @version     1.0.15
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://code.jquery.com/jquery-3.1.1.min.js
// @updateURL   https://raw.githubusercontent.com/javitonino/grease/master/github.com/kanban/projects.user.js
// ==/UserScript==

var MILESTONE_CACHE = {};
var ISSUE_DATA_CACHE = {};
var TOKEN = GM_getValue('oauth_token');
var USER_LOGIN = $('meta[name=user-login]').attr('content');
var IGNORED_COLUMNS = ['Done', 'Done in previous shifts'];
var REVIEWER_BLACKLIST = ['houndci-bot'];
var PRIORITY_STYLE = 'background: repeating-linear-gradient(-45deg, #fff, #fff 20px, #fee 20px, #fee 21px, #fff 22px); border-color: #faa !important;';
var REVIEWS = {
  'PENDING' : { 'color': '#fbca04', text: '?' },
  'APPROVED' : { 'color': '#0e8a16', text: '✔' },
  'COMMENTED' : { 'color': '#0052cc', text: '💬' },
  'CHANGES_REQUESTED' : { 'color': '#d93f0b', text: '✖' },
  'DISMISSED' : { 'color': '#cccccc', text: 'D' },
  'OTHERS' : { 'color': '#cccccc', text: 'O' }
};

function getIssueData(card_link, callback) {
  if (card_link === void 0) {
    return;
  }

  var cache = ISSUE_DATA_CACHE[card_link];
  if (cache) { return callback(cache); }
  
  var link_parts = card_link.split('/');
  var query = 'query { repository(owner: "' + link_parts[1] + '", name: "' + link_parts[2] + '") { issue(number: ' + link_parts[4] + ') {  milestone { resourcePath } timeline(first: 100) {  nodes { ... on CrossReferencedEvent {source { ... on PullRequest { number, resourcePath, reviews(last: 1) {nodes { state, author { login } } } } } } } } } } }';

  $.ajax('https://api.github.com/graphql', {
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json',
    data: JSON.stringify({ "query": query }),
    method: 'POST'
  }).done(function(data) {
    ISSUE_DATA_CACHE[card_link] = data;
    callback(data);
  });
}


function getMilestoneData(milestone_link, callback) { 
  if (milestone_link === void 0) {
    return;
  }

  var cache = MILESTONE_CACHE[milestone_link];
  if (cache) { return callback(cache); }
  
  $.ajax('https://api.github.com/repos' + milestone_link, {
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json'
  }).done(function(data) {
    MILESTONE_CACHE[milestone_link] = data;
    callback(data);
  });
}


function assignIssue(card_link) {
  $.ajax('https://api.github.com/repos' + card_link + '/assignees', {
    method: 'POST',
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json',
    data: JSON.stringify({ assignees: [USER_LOGIN] })
  });
}


function unassignIssue(card_link) {
  $.ajax('https://api.github.com/repos' + card_link + '/assignees', {
    method: 'DELETE',
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json',
    data: JSON.stringify({ assignees: [USER_LOGIN] })
  });
}


function buildReviewSpan (review) {
  var style = '';
  style += 'font-weight: 600;';
  style += 'padding-left: 2px;';
  style += 'color: ' + REVIEWS[review].color + ';';

  return $('<span style="' + style + '">' + REVIEWS[review].text + '</span>');
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
  if (card.data('links-loaded')) {
      return;
  } else {
      card.data('links-loaded', true);
  }
  
  if (card.find('.issue-card-label:contains(major-priority)').length > 0) {
    card.prop('style', PRIORITY_STYLE);
  }

  var column = card.closest('.project-column').find('.js-project-column-name').html();
  if (IGNORED_COLUMNS.includes(column)) { return; }

  var card_link = card.find('a.h5').attr('href');
  
  if (card_link) {
    // Issue
    card.append('<div class="milestone-container pl-5 p-2"></div>');

    getIssueData(card_link, function(data) {
      if (!data.data.repository.issue) {
        return;
      }

      data.data.repository.issue.timeline.nodes.forEach(function(i) {
        if (i.source && i.source.number) {
          var url = i.source.resourcePath;
          var labels = card.find('.labels');
          if (labels.length == 0) {
            labels = $('<span class="labels d-block pb-1 pr-6"></span>');
            card.find('.d-block').after(labels);
          }
          var pr = $('<a class="issue-card-label css-truncate css-truncate-target label mt-1 v-align-middle labelstyle-fbca04 linked-labelstyle-fbca04 tooltipped tooltipped-n" href="' + i.source.resourcePath + '" style="color: #4078c0; border: 1px solid #DDD; border-radius: 3px; box-shadow: none; margin-right: 3px;">#' + i.source.number + '</a>');
          labels.append(pr);

          parseReviews(i.source.reviews.nodes, pr);
        }
      });

      if (data.data.repository.issue.milestone) {
        getMilestoneData(data.data.repository.issue.milestone.resourcePath.replace("milestone", "milestones"), function(data) {
          var total_issues = data.open_issues + data.closed_issues;
          var percent = data.closed_issues / total_issues * 100;
          var progress_bar = ' background: linear-gradient(90deg, #6cc644 ' + percent + '%, #EEE ' + percent +'%)';
          card.find('.milestone-container').append('<div style="height: 2px; margin: 0 0 11px 0; ' + progress_bar + '"></div><a class="text-gray" style="font-size: 12px; line-height: 14px; display: block;" href="' + data.html_url + '">' + data.title + ' (' + Math.round(percent) + '%)</a>');
        });
      }
    });
  } else {
    // Note
    var text = card.find('.mr-4 p').html();
    if (text.startsWith('==') && text.endsWith('==')) {
      card.find('.mr-4 p').html(text.replace(/=/g, ''));
      card.find('.mr-4 small').remove();
      card.find('.mr-4 p').css('margin-bottom', 0);
      card.find('.mr-4 p').css('font-weight', 'bold');
      card.css('background-color', 'rgb(225, 228, 232)');
    }
  }
}


function addMenuOptions(card) {
  if (card.data('menu-loaded')) {
    return;
  } else {
    card.data('menu-loaded', true);
  }

  var card_link = card.find('a.h5').attr('href');
  var assignees = card.find('.avatar').map(function(i, v) { return $(v).data('assignee'); }).toArray();

  var assign_button;
  if (assignees.includes(USER_LOGIN)) {
    assign_button = $('<button class="dropdown-item text-left btn-link js-menu-close">Unassign myself</button>');
    assign_button.on('click', function() {
      unassignIssue(card_link);
      assign_button.remove();
    });
  } else {
    assign_button = $('<button class="dropdown-item text-left btn-link js-menu-close">Assign myself</button>');
    assign_button.on('click', function() {
      assignIssue(card_link);
      assign_button.remove();
    });
  }
  card.find('.dropdown-menu').prepend(assign_button);
}

$(function() {
  if (!TOKEN) {
    TOKEN = prompt("I need an Oauth token with the repo scope from https://github.com/settings/tokens", "");
    if (TOKEN) {
      GM_setValue('oauth_token', TOKEN);
    } else {
      return;
    }
  }

  $(document).on('DOMSubtreeModified', '.issue-card', function(e) {
    var card = $(e.currentTarget);
    addPRLinks(card);
    addMenuOptions(card);
  });

  $('.issue-card').each(function(i, v) {
    var card = $(v);
    addPRLinks(card);
    addMenuOptions(card);
  });
});
