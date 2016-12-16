// ==UserScript==
// @name        GitHub projects
// @namespace   github.javiertorres.eu
// @include     https://github.com/orgs/*/projects/*
// @include     https://github.com/*/*/projects/*
// @version     1.0.0
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://code.jquery.com/jquery-3.1.1.min.js
// @updateURL   https://raw.githubusercontent.com/javitonino/grease/master/github.com/projects.user.js
// ==/UserScript==

var ISSUE_TAG_STYLE = 'class="_issue_tag" style="border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 3px; font-size: 12px; padding: 2px 5px;"';
var ISSUE_CACHE = {};
var TOKEN = GM_getValue('oauth_token');
var USER_LOGIN = $('meta[name=user-login]').attr('content');
var IGNORED_COLUMNS = ['TODO', 'Done'];

function getIssueData(card_link, callback) {
  var cache = ISSUE_CACHE[card_link];
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
    ISSUE_CACHE[card_link] = data;
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
  getIssueData(card_link, function(data) {
    data.forEach(function(i) {
      if (i.event == 'cross-referenced' && i.source.type === 'issue' && i.source.issue.pull_request) {
        var url = i.source.issue.html_url;
        var number = url.split('/').pop();
        url = url.replace('/repos', '').replace('api.', '');
        card.append('<a href="' + url + '" ' + ISSUE_TAG_STYLE + '>#' + number + '</a>');
      }
    });
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
