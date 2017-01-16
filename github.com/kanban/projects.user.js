// ==UserScript==
// @name        GH Kanban (projects)
// @namespace   github.javitonino.eu
// @include     https://github.com/orgs/*/projects/*
// @include     https://github.com/*/*/projects/*
// @version     1.0.4
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://code.jquery.com/jquery-3.1.1.min.js
// @updateURL   https://raw.githubusercontent.com/javitonino/grease/master/github.com/kanban/projects.user.js
// ==/UserScript==

var ISSUE_REFERENCES_CACHE = {};
var ISSUE_DATA_CACHE = {};
var TOKEN = GM_getValue('oauth_token');
var USER_LOGIN = $('meta[name=user-login]').attr('content');
var IGNORED_COLUMNS = ['Done'];
var REVIEWER_BLACKLIST = ['houndci-bot'];
var reviewStates = ['PENDING', 'COMMENTED', 'CHANGES_REQUESTED', 'DISMISSED', 'APPROVED', 'OTHERS'];
var reviewColors = ['#ced4da', '#91a7ff', '#f59f00', '#f03e3e', '#40c057', '#faa2c1'];

function getIssueTimeline(card_link, callback) {
  var cache = ISSUE_REFERENCES_CACHE[card_link];
  if (cache) { return callback(cache); }

  $.ajax('https://api.github.com/repos' + card_link + '/timeline', {
    accepts: {
      json: 'application/vnd.github.mockingbird-preview'
    },
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json'
  }).done(function(data) {
    ISSUE_REFERENCES_CACHE[card_link] = data;
    callback(data);
  });
}


function getIssueData(card_link, callback) {
  var cache = ISSUE_DATA_CACHE[card_link];
  if (cache) { return callback(cache); }

  $.ajax('https://api.github.com/repos' + card_link, {
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json'
  }).done(function(data) {
    ISSUE_DATA_CACHE[card_link] = data;
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


function getReviewStateIndex (state) {
  return reviewStates.indexOf(state) !== -1 ? reviewStates.indexOf(state) : reviewStates.indexOf('OTHERS');
}


function buildReviewStyle (review) {
  var style = '';
  style += 'padding: 2px 4px;';
  style += 'font-size: 8px;';
  style += 'font-weight: 600;'
  style += 'background-color: ' + reviewColors[getReviewStateIndex(review)] + ';';
  style += 'color: #fff;';
  style += 'margin-right: 4px;';

  return style;
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


function parseReview (data, card) {
  var style = '';
  var comments = [];
  var review = '';
  data.forEach(function (review) {
    if (REVIEWER_BLACKLIST.indexOf(review.user.login) === -1) {
      if (comments.indexOf(review.state) === -1) {
        comments.push(review.state); // Only unique types of comments
      }
    }
  });

  if (comments.length === 1 && comments[0] === 'COMMENTED') {
    review = comments[0]; // It's only commented
  } else if (comments.length > 1) {
    for (var i = comments.length; i > 0 && !review; --i) {
      if (comments[i] !== 'COMMENTED') {
        review = comments[i]; // Getting the last meaningful comment that's not 'COMMENTED'
      }
    }
  }

  review = review || 'PENDING';
  style = buildReviewStyle(review);
  card.append('<span style="' + style + '"> CR ' + review + '</review>');
}


function getReviewsData (pullRequestUrl, card) {
  var prInfo = getPRInfoFromUrl(pullRequestUrl);
  if (prInfo) {
    var reviewUrl = 'https://api.github.com/repos/' + prInfo.owner + '/' + prInfo.repo + '/pulls/' + prInfo.id + '/reviews';

    $.ajax(reviewUrl, {
      accepts: {
        json: 'application/vnd.github.black-cat-preview+json'
      },
      headers: {
        Authorization: 'token ' + TOKEN
      },
      dataType: 'json'
    }).done(function(data) {
      parseReview(data, card);
    });
  }
}


function addPRLinks(card) {
  if (card.data('links-loaded')) {
      return;
  } else {
      card.data('links-loaded', true);
  }

  var column = card.closest('.project-column').find('.js-project-column-name').html();
  if (IGNORED_COLUMNS.includes(column)) { return; }

  var card_link = card.find('h5 a').attr('href');
  card.append('<div class="milestone-container" style="margin: 8px 8px 0 0; padding: 0 0 2px 0"></div>');

  getIssueTimeline(card_link, function(data) {
    data.forEach(function(i) {
      if (i.event == 'cross-referenced' && i.source.type === 'issue' && i.source.issue.pull_request) {
        var url = i.source.issue.html_url;
        var o = {
          'url': url.replace('/repos', '').replace('api.', ''),
          'number': url.split('/').pop()
        };
        card.find('.labels').append('<a class="issue-card-label css-truncate css-truncate-target label mt-1 v-align-middle labelstyle-fbca04 linked-labelstyle-fbca04 tooltipped tooltipped-n" href="' + o.url + '" style="color: #4078c0; border: 1px solid #DDD; border-radius: 3px; box-shadow: none; margin-right: 3px;">#' + o.number + '</a>');

        getReviewsData(url, card);
      }
    });
  });

  getIssueData(card_link, function(data) {
    if (data.milestone) {
      var total_issues = data.milestone.open_issues + data.milestone.closed_issues;
      var percent = data.milestone.closed_issues / total_issues * 100;
      var progress_bar = ' background: linear-gradient(90deg, #6cc644 ' + percent + '%, #EEE ' + percent +'%)';
      card.find('.milestone-container').append('<div style="height: 2px; margin: 0 0 11px 0; ' + progress_bar + '"></div><a class="text-gray" style="font-size: 12px; line-height: 14px; display: block;" href="' + data.milestone.html_url + '">' + data.milestone.title + ' (' + Math.round(percent) + '%)</a>');
    }
  });
}


function addMenuOptions(card) {
  if (card.data('menu-loaded')) {
    return;
  } else {
    card.data('menu-loaded', true);
  }

  var card_link = card.find('h5 a').attr('href');
  var assignees = card.find('.avatar').map(function(i, v) { return $(v).attr('alt').substring(1); }).toArray();

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
