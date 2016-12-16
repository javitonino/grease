// ==UserScript==
// @name        GH Kanban (issues)
// @namespace   github.javiertorres.eu
// @include     https://github.com/*/*/issues/*
// @include     https://github.com/*/*/pulls/*
// @version     1.0.0
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://code.jquery.com/jquery-3.1.1.min.js
// @updateURL   https://raw.githubusercontent.com/javitonino/grease/master/github.com/kanban/issues.user.js
// ==/UserScript==

var PROJECT_COLUMNS_CACHE = {};
var TOKEN = GM_getValue('oauth_token');


function getProjectId(project_url, callback) {
  var cache = GM_getValue('project:' + project_url);
  if (cache) { return callback(cache); }

  var last_path = project_url.lastIndexOf('/');
  var owner = project_url.substring(0, last_path);
  var number = project_url.substring(last_path + 1);

  $.ajax('https://api.github.com' + owner, {
    accepts: {
      json: 'application/vnd.github.inertia-preview+json'
    },
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json'
  }).done(function(data) {
    data.forEach(function(project) {
      if (project.number == number) {
        GM_setValue('project:' + project_url, project.id);
        return callback(project.id);
      }
    });
  });
}


function getProjectColumns(project_id, callback) {
  var cache = GM_getValue('columns:' + project_id);
  if (cache) { return callback(JSON.parse(cache)); }

  $.ajax('https://api.github.com/projects/' + project_id + '/columns', {
    accepts: {
      json: 'application/vnd.github.inertia-preview+json'
    },
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json'
  }).done(function(data) {
    GM_setValue('columns:' + project_id, JSON.stringify(data));
    callback(data);
  });
}


function moveCard(card_id, column_id, callback) {
  $.ajax('https://api.github.com/projects/columns/cards/' + card_id + '/moves', {
    method: 'POST',
    accepts: {
      json: 'application/vnd.github.inertia-preview+json'
    },
    headers: {
      Authorization: 'token ' + TOKEN
    },
    dataType: 'json',
    data: JSON.stringify({ column_id: column_id, position: 'bottom' })
  }).done(function(data) {
    callback(data);
  });
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

  var project = $('.discussion-sidebar-item:contains(Projects) .css-truncate p');
  var column = $.trim(project.html().split('in')[0]);
  var card_link = project.find('a').attr('href');

  var project_link = card_link.split('#')[0];
  var card_id = card_link.split('#')[1].split('-')[1];

  getProjectId(project_link, function(project_id) {
    getProjectColumns(project_id, function(columns) {
      var current_column = columns.findIndex(function(c) { return c.name == column; });
      var next_column = columns[current_column + 1];

      var move_button = $('<p><a href="#">Move to ' + next_column.name + '</a></p>');
      move_button.on('click', function(e) {
        e.preventDefault();
        $(e.target).parent().html('Moving...');
        moveCard(card_id, next_column.id, function() {
          $(e.target).parent().html('Moved');
        });
      });
      project.append(move_button);
    });
  });
});
