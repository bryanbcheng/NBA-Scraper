/* Imports */
var http = require('http'),
	//express = require('express'),
	_ = require('underscore'),
	$ = require('jquery'),
	util = require('util');

/* Database */
/* Connect to MySQL */


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
		
		console.log(game);
		/* TODO add to mysql */
	});
}

/* Function to get time and location of game */
function getTimeLocation(data, game) {
	var html = $(data);
	var timeLocation = html.find("div.game-time-location p");
	game.time = timeLocation.first().text();
	game.location = timeLocation.last().text();
}

/* Function to get line-scores (per quarter) */
function getLineScores(data, game) {
	var html = $(data);
	var scores = html.find("table.linescore tr");
	var periods = $(scores[0]).children();
	var awayTeam = $(scores[1]).children();
	var homeTeam = $(scores[2]).children();
	
	game.awayTeam = {id: awayTeam.first().text()};
	game.homeTeam = {id: homeTeam.first().text()};
	for (var i = 1; i < periods.length; i++) {
		var period = $(periods[i]).text().trim();
		game.awayTeam[period] = $(awayTeam[i]).text();
		game.homeTeam[period] = $(homeTeam[i]).text();
	}
}

/* Helper function to parse player data */
function parsePlayerData(data, game, playerData) {
	var player = {gameId: game.id};
	var it = $(playerData).children().first();
	player.id = parseId(it.find("a").attr("href"));
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
	/* TODO: update mysql */
}

/* Function to get player data */
function getPlayerData(data, game) {
	var html = $(data);
	var players = html.find("#my-players-table table tr[class*=player]");
	
	players.each(function(i, e) {
		parsePlayerData(data, game, e);
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
	
	var awayTeamData = $(teams[2]).find("tr");
	var homeTeamData = $(teams[5]).find("tr");
	
	parseTeamTotals(data, game, awayTeamData[0], game.awayTeam);
	parseTeamExtras(data, game, awayTeamData[2], game.awayTeam);
	
	parseTeamTotals(data, game, homeTeamData[0], game.homeTeam);
	parseTeamExtras(data, game, homeTeamData[2], game.homeTeam);
	
	/* TODO: mysql team data */
}

/* Function to get extra data */
function getExtraData(data, game) {
	var html = $(data);
	var extras = html.find("div.mod-content").clone().children().remove().end();
	
	game.flagrants = $(extras.contents()[2]).text();
	game.technicals = $(extras.contents()[3]).text();
	game.officials = $(extras.contents()[4]).text();
	game.attendance = $(extras.contents()[5]).text();
	game.timeLength = $(extras.contents()[6]).text();
}

function main() {
	getBoxScoreLinks(20121219, function(links) {
		getBoxScoreData(links[0]);
	});
}

main();