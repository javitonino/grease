// ==UserScript==
// @name        GH Kanban (projects)
// @namespace   github.saleiva.eu
// @include     https://github.com/orgs/*/projects/*
// @include     https://github.com/*/*/projects/*
// @version     1.0.2
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://code.jquery.com/jquery-3.1.1.min.js
// @updateURL   https://github.com/saleiva/grease/raw/master/github.com/kanban/projects.user.js
// ==/UserScript==

var ISSUE_REFERENCES_CACHE = {};
var ISSUE_DATA_CACHE = {};
var TOKEN = GM_getValue('oauth_token');
var USER_LOGIN = $('meta[name=user-login]').attr('content');
var IGNORED_COLUMNS = ['Done'];

function getIssueData(card_link, callback) {
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


function getIssueTimeline(card_link, callback) {
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

  getIssueData(card_link, function(data) {
    data.forEach(function(i) {
      if (i.event == 'cross-referenced' && i.source.type === 'issue' && i.source.issue.pull_request) {
        var url = i.source.issue.html_url;
        var o = {
          'url': url.replace('/repos', '').replace('api.', ''),
          'number': url.split('/').pop()
              };
        card.find('.labels').append('<a class="issue-card-label css-truncate css-truncate-target label mt-1 v-align-middle labelstyle-fbca04 linked-labelstyle-fbca04 tooltipped tooltipped-n" href="' + o.url + '" style="color: #4078c0; border: 1px solid #DDD; border-radius: 3px; box-shadow: none; margin-right: 3px;">#' + o.number + '</a>');
      }
    });
  });

  getIssueTimeline(card_link, function(data) {
    if (data.milestone) {
      var total_issues = data.milestone.open_issues + data.milestone.closed_issues;
      var percent = data.milestone.closed_issues / total_issues * 100;
      var progress_bar = ' background: linear-gradient(90deg, #6cc644 ' + percent + '%, #DDDDDD ' + percent +'%)';
      card.find('.milestone-container').append('<div style="height: 2px; margin: 0 0 8px 0; ' + progress_bar + '"></div><a class="text-gray" style="font-size: 13px" href="' + data.milestone.html_url + '"><strong>MS</strong> ' + data.milestone.title + '</a>');
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
