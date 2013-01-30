/* Imports */
var http = require('http'),
	//express = require('express'),
	_ = require('underscore'),
	$ = require('jquery'),
	util = require('util');

/* Database */
/* Connect to MySQL */
var mysql = require('mysql');
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'valefor',
  database : 'nba_data'
});

var base_url = "scores.espn.go.com";

/* Function to get HTML page */
function getHtmlPage(hostname, path, cb) {
	var options = {
	  hostname: hostname,
	  port: 80,
	  path: path,
	  method: 'GET'
	};
	
	var req = http.request(options, function(res) {
	  res.setEncoding('utf8');
	  
	  var body = "";
	  res.on('data', function (chunk) {
	  	body += chunk;
	  });
	  
	  res.on('end', function () {
	  	cb(body);
	  });
	});
	
	req.on('error', function(e) {
	  console.log('problem with request: ' + e.message);
	});
	
	req.end();
}

/* Function to get all boxscore links for given date. Date format must be yyyymmdd */
function getBoxScoreLinks(date, cb) {
	getHtmlPage(base_url, "/nba/scoreboard?date=" + date, function(data) {
		var html = $(data);
		
		var links = [];
		html.find("div.expand-gameLinks a:contains('Box')").each(function(i, e) {
			links.push($(e).attr("href"));
		});
		
		cb(links);
	});
}

var patt = /\d+/g;
/* Parse the id from the link */
function parseId(link) {
	return link.match(patt)[0];
}

/* Function to parse data from box score. */
function getBoxScoreData(link) {
	getHtmlPage(base_url, link, function(data) {
		var game = {id: parseId(link)};
		getTimeLocation(data, game);
		getLineScores(data, game);
		getPlayerData(data, game);
		getTeamData(data, game);
		getExtraData(data, game);
		
		game.away_score = game.away_team.pts;
		game.home_score = game.home_team.pts;
		game.away_team = game.away_team.team_id;
		game.home_team = game.home_team.team_id;
		
		/* TODO add to mysql */
		var query = connection.query('INSERT INTO games SET ?', game, function(err, result) {
			// check?
		});
	});
}

/* Function to get time and location of game */
function getTimeLocation(data, game) {
	var html = $(data);
	var timeLocation = html.find("div.game-time-location p");
	game.time = timeLocation.first().text();
	game.location = timeLocation.last().text();
}

var quarters = ['team_id', 'q1', 'q2', 'q3', 'q4', 'ot1', 'ot2', 'ot3', 'ot4'];

/* Function to get line-scores (per quarter) */
function getLineScores(data, game) {
	var html = $(data);
	var scores = html.find("table.linescore tr");
	var periods = $(scores[0]).children();
	var away_team = $(scores[1]).children();
	var home_team = $(scores[2]).children();
	
	game.away_team = {team_id: away_team.first().text()};
	game.home_team = {team_id: home_team.first().text()};
	for (var i = 1; i < periods.length - 1; i++) {
// 		var period = $(periods[i]).text().trim();
		var period = quarters[i];
		game.away_team[period] = $(away_team[i]).text();
		game.home_team[period] = $(home_team[i]).text();
	}
}

/* Helper function to parse player data */
function parsePlayerData(data, game, playerData, teamId) {
	var player = {game_id: game.id, team_id: teamId};
	var it = $(playerData).children().first();
	player.player_id = parseId(it.find("a").attr("href"));
	if ($(playerData).children().length > 2) {
		player.min = (it = it.next()).text();
		player.fgm = (it = it.next()).text().split("-")[0];
		player.fga = it.text().split("-")[1];
		player.tpm = (it = it.next()).text().split("-")[0];
		player.tpa = it.text().split("-")[1];
		player.ftm = (it = it.next()).text().split("-")[0];
		player.fta = it.text().split("-")[1];
		player.oreb = (it = it.next()).text();
		player.dreb = (it = it.next()).text();
		player.reb = (it = it.next()).text();
		player.ast = (it = it.next()).text();
		player.stl = (it = it.next()).text();
		player.blk = (it = it.next()).text();
		player.to = (it = it.next()).text();
		player.pf = (it = it.next()).text();
		player.pm = (it = it.next()).text();
		player.pts = (it = it.next()).text();
	} else {
		player.dnp = (it = it.next()).text();
	}
	
	var query = connection.query('INSERT INTO players_stats SET ?', player, function(err, result) {
		// check?
	});
}

/* Function to get player data */
function getPlayerData(data, game) {
	var html = $(data);
	var players = html.find("#my-players-table table tr[class*=player]");
	
	players.each(function(i, e) {
		parsePlayerData(data, game, e, (i < 13 ? game.away_team.team_id : game.home_team.team_id));
	});
}

/* Helper function to parse team totals data */
function parseTeamTotals(data, game, teamData, team) {
	var it = $(teamData).children().first();
	team.fgm = (it = it.next()).text().split("-")[0];
	team.fga = it.text().split("-")[1];
	team.tpm = (it = it.next()).text().split("-")[0];
	team.tpa = it.text().split("-")[1];
	team.ftm = (it = it.next()).text().split("-")[0];
	team.fta = it.text().split("-")[1];
	team.oreb = (it = it.next()).text();
	team.dreb = (it = it.next()).text();
	team.reb = (it = it.next()).text();
	team.ast = (it = it.next()).text();
	team.stl = (it = it.next()).text();
	team.blk = (it = it.next()).text();
	team.to = (it = it.next()).text();
	team.pf = (it = it.next()).text();
	team.pts = (it = it.next().next()).text();
}

/* Helper function to parse team extras data */
function parseTeamExtras(data, game, teamData, team) {
	var extrasData = $(teamData).find("td div:first").text().match(patt);
	
	team.fbp = extrasData[0];
	team.pip = extrasData[1];
	team.ttt = extrasData[2];
	team.pot = extrasData[3];
}

/* Function to get team data */
function getTeamData(data, game) {
	var html = $(data);
	var teams = html.find("#my-players-table tbody");
	
	var away_team_data = $(teams[2]).find("tr");
	var home_team_data = $(teams[5]).find("tr");
	
	parseTeamTotals(data, game, away_team_data[0], game.away_team);
	parseTeamExtras(data, game, away_team_data[2], game.away_team);
	
	parseTeamTotals(data, game, home_team_data[0], game.home_team);
	parseTeamExtras(data, game, home_team_data[2], game.home_team);
	
	/* TODO: mysql team data */
	var query = connection.query('INSERT INTO teams_stats SET ?', _.extend({game_id: game.id}, game.away_team), function(err, result) {
		// check?
	});
	var query = connection.query('INSERT INTO teams_stats SET ?', _.extend({game_id: game.id}, game.home_team), function(err, result) {
		// check?
	});
}

/* Function to get extra data */
function getExtraData(data, game) {
	var html = $(data);
	var extras = html.find("div.mod-content").clone().children().remove().end();
	
	game.flagrants = $(extras.contents()[2]).text();
	game.technicals = $(extras.contents()[3]).text();
	game.officials = $(extras.contents()[4]).text();
	game.attendance = parseInt(($(extras.contents()[5]).text()).replace(/\,/g,''),10);
	game.time_length = $(extras.contents()[6]).text();
}

function main() {
	connection.connect(function(err) {
		// connected!
		
		getBoxScoreLinks(20121219, function(links) {
			for (var i in links) {
				getBoxScoreData(links[i]);
			}
		});
	});
}

main();