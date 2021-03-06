/*
 * This program is copyright © 2013 BashfulBladder and is distributed under the terms of the GNU GPL 
 * version 2.0 with a special clarification/exception that permits adapting the program to 
 * configure proprietary "back end" software provided that all modifications to the web interface
 * itself remain covered by the GPL. 
 * See http://gargoyle-router.com/faq.html#qfoss for more information
 */

var shellvarsupdater = null;
var vdr=new Array();
var nfloor=new Array(); // [channel# (136), frequency in MHz (5700), noise floor (-120)]
var curr_sta = 0;

var band2p4noise = null;
var band5p0noise = null;
var plotStationData = null;

window.onkeyup = KeyCaptureU;
window.onkeydown = KeyCaptureD;

var updateTotalPlot = null;
var Band2p4ChartPlot = null;
var Band5p0ChartPlot = null;
var FiveGHzBand = 0;
var TwoP4GHzBand = 1;

//
//  MatchOUI matches a devices first 3 octets of the MAC address with a vendor listing
//    mac is the colon separated 6 octet address of the device (may be lowercase if iw was used)
//  Tease out the octets from the colons for the first 3 octets, uppercase the hex & match 1-by-1 against the OUIs.js vendor listings
//  Returns: a string - either "unknown" or the matching vendor
//
function MatchOUI(mac) {
	var devOUI = mac.substr(0,2) + mac.substr(3,2) + mac.substr(6,2);
	for (var i=0; i < vdr.length; i++) { 
		if (devOUI.toUpperCase().match(vdr[i][0])) { return vdr[i][1]; }
	}
	return "unknown"
}

//
//  CleanTable will delete the rows in the given table
//
function CleanTable(table) {
	if (table == null) { return; }
	if (table.rows.length == 1) { return; }
	
	for(var i = table.rows.length; i > 0; i--) {
		table.deleteRow(i-1);
	}
}

//
//  NewTextDiv generates a stack of text from strArray with linebreaks
//    strArray contains the text that will be added
//    col is the identifier for the element
//  Returns: an html div element with text content already incorporated that needs appending to the HTML DOM
//
function NewTextDiv(strArray, col) {
	var a_div=document.createElement('div')
	a_div.style.width='auto';
	a_div.id="col" + col;
	a_div.style.textAlign="center"
	for (var i=0; i < strArray.length; i++) {
		a_div.innerHTML+=strArray[i]+ "<br/>\n";
	}
	return a_div;
}

//
//  SNRDiv creates an HTML div with a span element of the iw SNR graphical display, plus text underneath
//  Returns: an html div element with the span & text elements incorporated that needs appending to the HTML DOM
//
function SNRDiv(freq, strength, noise_floor, width, row) {
	var floor=-120;
	if (noise_floor < 0) {
		floor = noise_floor;
	} else {
		for (var i=0; i < nfloor.length; i++) {
			if (freq*1000 == nfloor[i][1]) {
				floor=nfloor[i][2];
				break;
			}
		}
	}
	var SNR=strength-floor;
	if (SNR > 60) { SNR = 60; } //limit SNR to 60 

	var a_tag = document.createElement('a');
	if (row%2 == 1) {
		a_tag.className = "backer";
	} else {
		a_tag.className = "dbacker";
	}
	a_tag.title="Signal to noise ratio: " + SNR;
	
	var a_span = document.createElement('span');
	a_span.style.width=90 * (SNR/60) + "px";
	if (SNR >= 40) {
		a_span.className = "bfiller";
	} else if (SNR >=30 && SNR < 40) {
		a_span.className = "gfiller";
	} else if (SNR >=20 && SNR < 30) {
		a_span.className = "yfiller";
	} else if (SNR >=10 && SNR < 20) {
		a_span.className = "ofiller";
	} else {
		a_span.className = "rfiller";
	}	
	setSingleChild(a_tag, a_span);
	
	var a_div=document.createElement('div');
	a_div.id="col4";
	a_div.style.width=width + "px";
	a_div.style.textAlign="center";
	a_div.appendChild(a_tag);
	a_div.title="Signal level/Noise floor, in dBm";
	a_div.innerHTML+=strength + "/" + floor + "<br/>\n";
	return a_div;
}

//
//  SignalDiv creates an HTML div with a span element of the iwlist quality graphical display, plus text underneath
//  Returns: an html div element with the span & text elements incorporated that needs appending to the HTML DOM
//
function SignalDiv(qual, strength, width, row) {
	var a_tag = document.createElement('a');
	if (row%2 == 1) {
		a_tag.className = "backer";
	} else {
		a_tag.className = "dbacker";
	}
	a_tag.title="Quality of signal: " + qual;
	
	var a_span = document.createElement('span');
	var fillage=eval(qual);
	a_span.style.width=90 * fillage + "px";
	if (fillage < 0.333) {
		a_span.className = "rfiller";
	} else if (fillage < 0.666) {
		a_span.className = "yfiller";
	} else {
		a_span.className = "gfiller";
	}	
	setSingleChild(a_tag, a_span);
	
	var a_div=document.createElement('div');
	a_div.id="col4";
	a_div.style.width=width + "px";
	a_div.style.textAlign="center";
	a_div.appendChild(a_tag);
	a_div.title="Signal level, in dBm";
	a_div.innerHTML+=strength+ "<br/>\n";
	return a_div;
}

//
//  strtotime takes a formatted (by survey.sh) timestamp & parses out the components into a date&time
//    ats is the formatted timestamp (example: 201305130944)
//  Returns: a javascript data variable (millisecond time) that can be subtracted easily to determine the passage of time 
//
function strtotime(ats) {
	var adate = new Date();
	adate.setFullYear(ats.substr(0, 4));
	adate.setMonth(ats.substr(4, 2));
	adate.setDate(ats.substr(6, 2));
	adate.setHours(ats.substr(8, 2));
	adate.setMinutes(ats.substr(10, 2));
	return adate;
}

//
//  milliToDHM converts javascript millisecond time to relative time in ever increasing units
//  Returns: a string representing elapsed relative time
//
function milliToDHM(msec) {
	var mdays = 86400000; //24*60*60*1000
	var mhrs = 3600000; //60*60*1000
	var d = Math.floor(msec / 86400000);
	msec-= d * 86400000;
	var h = Math.floor(msec / 3600000);
	msec-= h * 3600000;
	var m = Math.round(msec / 60000);
	return (d > 0 ? d + "d " : "") + (h > 0 ? h + "h " : "") + (m > 0 ? m + "m " : "") + "ago";
}

//
//  LastSeen subtracts timestamps after conversion & tracks how many stations have been seen in the last 10 minutes (600,000 miliseconds)
//  Returns: a string for the station table of how long ago a station has been scanned
//
function LastSeen(time_now, atimestamp) {
	var diff = Math.abs( strtotime(time_now) - strtotime(atimestamp) );
	if (diff < 600000) { curr_sta++; }
	return ( diff < 90000 ? "last seen now" : milliToDHM(diff) );
}

//
//  Speed evaluates the (not always increasing) speeds reported by survey.sh
//    sparr - the array of speeds reported (example: [54,48,150,450]
//  loop through the elements looking for the top speed to report
//  Returns: a string representing 802.11 speeds for the station table
//
function Speed(sparr) {
	var speed = 0;
	for (var i = 0; i < sparr.length; i++) {
		if (eval(sparr[i] > speed)) { speed = eval(sparr[i]); }
	}
	if (speed == 0) { return "unknown"; }
	if (speed <= 11) { return "802.11b"; }
	if (speed <= 54) { return "802.11g"; }
	if (speed <= 150) { return "802.11n"; }
	return ("802.11n" + " N" + speed);
}

//
//  Crypt examines the encryption settings for a station provided by survey.sh
//    pass - the password setting; karr is the encryption array (example: ["WPA2v1","CCMP","PSK"]
//  Returns: a string representing a station's encryption setting for the station table
//
function Crypt(pass, karr) {
	if (pass.match("off")) { return "none"; }
	if (pass.match("on")) {
		if (karr.length > 0) {
			var encr_str = "";
			for (var i = 0; i < karr.length; i++) {
				encr_str += karr[i][0] + " (" + karr[i][1] + "/" + karr[i][2] + ")";
				if (i < karr.length-1) {
					encr_str += "<br/>\n";
				}
			}
			return encr_str;
		} else {
			return "WEP";
		}
	}
	return "unknown";
}

//
//  ShowTracking sets the text at the upper right of the table to the number of stations seen in the last 45 days by survey.sh
//    num_sta - the actual number of stations
//  tries to align the data with the end of the table
//
function ShowTracking(num_sta) {
	if (document.getElementById('station_table') == null) { return; }
	if (document.getElementById('station_table').rows.length <= 1) { return }
	
	var fwidth = document.getElementById('wifi_survey').offsetWidth;
	var twidth = document.getElementsByTagName("tbody")[0].offsetWidth;
	var tspan = document.getElementById('tracking');
	
	tspan.innerHTML= "Tracking " + num_sta + " stations";
	tspan.style.width = 'auto';
	tspan.style.width = fwidth - twidth + tspan.offsetWidth + "px";
}

//
//  ShowCurrentInfo sets the text at the upper right of the table to the number of stations seen in the last 10minutes when hovered over
//    tspan - the element hovered over
//  stores the old text & width to restore when the mouse moves away from the text
//
function ShowCurrentInfo(tspan) {
	if (document.getElementById('station_table') == null) { return; }
	var fwidth = document.getElementById('wifi_survey').offsetWidth;
	var twidth = document.getElementsByTagName("tbody")[0].offsetWidth;
	var old_text = tspan.innerHTML;
	var old_width = tspan.style.width;
	
	tspan.innerHTML= curr_sta + " stations seen in last 10 minutes";
	tspan.style.width = 'auto';
	tspan.style.width = fwidth - twidth + tspan.offsetWidth + "px";
	tspan.onmouseout=(function(){ tspan.innerHTML=old_text; tspan.style.width=old_width});
}

function ShowAdvisory(wifi_interfaces) {
	if (wifi_interfaces.length == 0) {
		document.getElementById("advisory").innerHTML="Wireless interfaces are down; check every 2 minutes";
	} else {
		document.getElementById("advisory").innerHTML="Survey refreshes every 2 minutes";
	}
}

//
//  FillTable is where most the the table action occurs
//    new_shell_vars are the sdata array provided by survey.sh (only defined after a scan, not the initial page view)
//    now_time is the current time on the router (only defined after a scan, not the initial page view)
//  Clear the table before filling it up. Loop through each station & generate 4 columns of data & append onto the array of table data
//  Create the table element & append a (vertically limited) table to the div container element
//
function FillTable(new_shell_vars, now_time) {
	var nTime=(now_time == null ? curr_time : now_time);
	var stations = (new_shell_vars == null ? station_data : new_shell_vars);
	var tableData = new Array();
	
	if (stations.length == 0) {
		document.getElementById("note_txt").innerHTML="No stations were found <br/>\n";
	} else if (new_shell_vars != null) {
		document.getElementById("note_txt").innerHTML="";
	}
	
	CleanTable(document.getElementById("station_table"));
	
	for (var i=0; i < stations.length; i++) {
		var crypos = new Array();
		for (var j=0; j < stations[i].length-10; j++) {
			crypos.push(stations[i][10+j]);
		}
		var col1div=NewTextDiv([stations[i][7], stations[i][0], MatchOUI(stations[i][0])], i);
		var col2div=NewTextDiv(["Ch " + stations[i][2] + " | " + stations[i][3] + "GHz", Speed(stations[i][8]), Crypt(stations[i][6], crypos)], i);
		var col3div=NewTextDiv([stations[i][9], LastSeen(nTime, stations[i][1]) ], i);
		if (eval(stations[i][4]) < 0) {
			var col4div=SNRDiv(stations[i][3], stations[i][5], stations[i][4], 100, i);
		} else {
			var col4div=SignalDiv(stations[i][4], stations[i][5], 100, i);
		}
		tableData.push([col1div, col2div, col3div, col4div]);
	}
	
	var sTable = createTable([""], tableData, "station_table", false, false);
	var stableC = document.getElementById('station_table_container');
	if (stations.length < 7) {
		stableC.style.height="auto";
	} else {
		stableC.style.height="600px";
	}
	stableC.style.overflow="auto";
	setSingleChild(stableC, sTable);
	
	WarnOUIs(stations);
	ShowTracking(stations.length);
}

//
//  InitSurvey runs once when the page loads & creates the interval for running survey.sh scans: 2 minutes (120,000 milliseconds
//  Create & fill the table with old/stale survey.sh data from the last run - best to see old output while waiting for new data
//
function InitSurvey() {
	WarnOUIs(sdata);
	UpdateSurvey();
	shellvarsupdater = setInterval("UpdateSurvey(null)", 120000);
	ShowAdvisory(wifs);
	FillTable(null);
}

//
//  UpdateSurvey sends commands to the router & retrieves data for display in both table & charts
//  Sets up the callback to the shell commands (gets wifi status, router current time & runs survey.sh which gets station data, channels
//  and noise floor. Parse those variables from the results & send them off to enter the table & whittle down for charting 2.4/5GHz bands
//  Note: the iw/iwlist commands take some time to run so control is restored back to the browser before data arrives from the router
//
function UpdateSurvey() {
	var commands = [];
	document.getElementById("note_txt").innerHTML+="<br/>\nUpdating... <br/>\n";
	setControlsEnabled(true, false, "Updating station data");
	commands.push("echo \"var wifs=\\\"`awk '{gsub(/:/,\\\"\\\"); printf (NR>2 ? $1\\\" \\\" : null)} ' /proc/net/wireless`\\\";\"");
	commands.push("echo \"var curr_time=\\\"`date \"+%Y%m%d%H%M\"`\\\";\"");
	commands.push("if [ ! -e /tmp/tmp_survey.txt ] ; then /usr/lib/gargoyle/survey.sh ; else cat /tmp/survey_data.txt ; fi");
	
	var param = getParameterDefinition("commands", commands.join("\n")) + "&" + getParameterDefinition("hash", document.cookie.replace(/^.*hash=/,"").replace(/[\t ;]+.*$/, ""));
	
	var stateChangeFunction = function(req) {
		if (req.readyState == 4) {
			var shell_output = req.responseText.replace(/Success/, "");
			eval(shell_output);
			curr_sta=0;
			ShowAdvisory(wifs);
			FillTable(sdata, curr_time);
			setControlsEnabled(true);
			
			FiveGHzBand=0; TwoP4GHzBand=0;
			if (wifs.length > 0) {
				AssembleNoiseFloor(chdata, frqdata);
				AssembleBandLimitedNoiseFloor(nfloor);
				AssemblePlotStationData(sdata, curr_time);
				if (TwoP4GHzBand == 1) {
					document.getElementById('chutil').style.display = 'block';
					chart24();
				}
				if (FiveGHzBand==1) {
					document.getElementById('band50').style.display = 'block';
					chart50();
				} else {
					document.getElementById('band50').style.display = 'none';
				}
			} else {
				document.getElementById("note_txt").innerHTML="No stations were found <br/>\n";
				document.getElementById('chutil').style.display = 'none';
				
				document.getElementById('station_table_container').style.height="auto";
			}
		}
	}
	runAjax("POST", "utility/run_commands.sh", param, stateChangeFunction);
}

//
//  WarnOUIs both informs the user of whether OUIs.js was found, but also dynamically changes the action of the button + descriptive text
//  shell variables from the router are used to inform the user of where the OUIs.js was found & how a restart affects the file
//  Sets up the button to delete the OUIs.js if present, or download to RAM (or USB if cabability is present via shell vars on the router)
//
function WarnOUIs(stations) {
	if (vdr.length == 0 && stations.length > 0) {
		document.getElementById("oui_txt").innerHTML="IEEE OUIs were not found. Vendor lookup is disabled.";
	} else if (vdr.length > 0) {
		oui_info = document.getElementById("oui_txt");
		oui_info.innerHTML="IEEE OUIs (vendors) file found " + (oui_src == "RAM" ? "in RAM." : "on USB device.");
		if (wgetOUI.length > 0) {
			oui_info.innerHTML+=" Automatically downloads at startup.";
		} else {
			oui_info.innerHTML+=" File lost on reboot.";
		}
	}
	
	if (oui_src.length > 0) {
		var oui_button = document.getElementById("OUIs_button");
		oui_button.name="remove";
		oui_button.value="Remove vendors"
		document.getElementById("oui_info").innerHTML="Erase vendors/OUIs file. File is 803KB.";
		document.getElementById("button_info").innerHTML="Removes file in RAM on tmpfs, on USB devices & ends downloading at startup."
	} else {
		if (sharepoint.length > 0) {
			document.getElementById("button_info").innerHTML="Hold down alt/option key to survive restarts. Hold shift down to place file on USB device."
		} else {
			document.getElementById("button_info").innerHTML="Hold down alt/option key to survive restarts."
		}
	}
}

//
//  Fill_OUI_Info takes the button name (identifier handed by the button so no getElementById) set in KeyCaptureX functions
//  and provides descriptive text regarding its function
//
function Fill_OUI_Info(button_name) {
	var OUIsize = "803kb";
	var oui_info = document.getElementById("oui_info");
	if (button_name.match(/tmpfs/)) {
		oui_info.innerHTML="Download vendors/OUIs to RAM ";
		if (tmp_freespace < 10000) {
			setElementEnabled(document.getElementById("OUIs_button"), false);
			oui_info.innerHTML="Vendors would take too high a percentage of free RAM. File is "+OUIsize+".";
		}
	} else if (button_name.match(/usb/)) {
		oui_info.innerHTML="Download vendors/OUIs to USB device ";
		if (share_freespace < 2000) {
			setElementEnabled(document.getElementById("OUIs_button"), false);
			oui_info.innerHTML="Not enough space available on USB device to download vendors. File is "+OUIsize+".";
		}
	}
	
	if (button_name.match(/rc.local/)) {
		oui_info.innerHTML+="(+ automatically when router starts). File is "+OUIsize+".";
	} else {
		oui_info.innerHTML+="(lost after reboot). File is "+OUIsize+".";
	}
}

//
//  KeyCaptureD is the key down event - only shift & alt are listed to here where the button name is changed & shipped off
//
function KeyCaptureD(keyEvent) {
	if (wgetOUI.length > 0 || oui_src.length > 0) { return }
	var oui_button = document.getElementById("OUIs_button");
	if (oui_button.className.match(/disabled/)) { return }
	
	if (keyEvent.altKey) {
		oui_button.name="tmpfs+rc.local";
	}
	if (keyEvent.shiftKey && sharepoint.length > 0) {
		oui_button.name="usb";
	}
	if (keyEvent.shiftKey && keyEvent.altKey && sharepoint.length > 0) {
		oui_button.name="usb+rc.local";
	}
	if (keyEvent.altKey || keyEvent.shiftKey) {
		Fill_OUI_Info(oui_button.name);
	}
}

//
//  KeyCaptureU is the key up event - only shift & alt are listed to here where the button name is changed & shipped off
//
function KeyCaptureU(keyEvent) {
	if (wgetOUI.length > 0 || oui_src.length > 0) { return }
	var oui_button = document.getElementById("OUIs_button");
	if (oui_button.className.match(/disabled/)) { return }
	
	if (keyEvent.keyCode == 18) { // alt/option
		oui_button.name = oui_button.name.split("+")[0];
	}
	if (keyEvent.keyCode == 16 && sharepoint.length > 0) { // shift
		if (oui_button.name.length > 7) {
			oui_button.name = oui_button.name=="tmpfs+rc.local" ? "usb+rc.local" : "tmpfs+rc.local";
		} else {
			oui_button.name = oui_button.name=="tmpfs" ? "usb" : "tmpfs";
		}
	} else if (keyEvent.keyCode == 16) {
		if (oui_button.name.length > 7) {
			oui_button.name=="tmpfs+rc.local";
		} else {
			oui_button.name=="tmpfs";
		}
	}
	if (keyEvent.keyCode == 16 || keyEvent.keyCode == 18) {
		Fill_OUI_Info(oui_button.name);
	}
}

//
//  DoVendorFile will carry out the action for the OUIs.js file (after holding down modifier keys to change the button's name)
//    button_name is the identifier handed by the button so no getElementById
//  based on the button's name, carry out the delete/download action on the router to the target device & add the optional
//  rc.local startup script to re-download to the target when the router starts up. eweget is used because its a https link
//  After downloading the file is gzipped in-situ on the router - ewget failed to properly download the already gzipped file
//  Once the file has been downloaded, reload the page to add/remove vendor lookup on the table
//
function DoVendorFile(button_name) {
	var commands = [];
	if (button_name == "remove") {
		setControlsEnabled(false, true, "Purging vendors file");
		commands.push("rm -f /tmp/OUIs.js*");
		if (sharepoint.match(/\/tmp\/usb_mount/)) {
			commands.push("rm -f " + sharepoint + "/OUIs.js*");
		}
		commands.push("grep -v -e 'plugin-gargoyle-wifi-survey/OUIs.js' /etc/rc.local > /tmp/rc.local");
		commands.push("mv /tmp/rc.local /etc/rc.local");
	} else {
		setControlsEnabled(false, true, "Downloading vendors file");
		commands.push("ewget https://raw.github.com/BashfulBladder/gargoyle-plugins/master/plugin-gargoyle-wifi-survey/OUIs.js -O " + 
						(button_name.split("+")[0] == "usb" ? sharepoint : "/tmp") + "/OUIs.js && gzip -9 "+ (button_name.split("+")[0] == "usb" ? sharepoint : "/tmp")+"/OUIs.js");
		if (button_name.split("+").length > 1) {
			if (button_name == "usb+rc.local") {
				commands.push("ouiLine=\"if [ ! -e " + sharepoint + "/OUIs.js ] || [ ! -e " + sharepoint + "/OUIs.js.gz ]; then ewget https://raw.github.com/BashfulBladder/gargoyle-plugins/master/plugin-gargoyle-wifi-survey/OUIs.js -O " + sharepoint + "/OUIs.js && gzip -9 "+   sharepoint + "/OUIs.js ; fi\"");
			} else {
				commands.push("ouiLine=\"ewget https://raw.github.com/BashfulBladder/gargoyle-plugins/master/plugin-gargoyle-wifi-survey/OUIs.js -O /tmp/OUIs.js && gzip -9 /tmp/OUIs.js\"");
			}
			commands.push("grep -v -e 'plugin-gargoyle-wifi-survey/OUIs.js' /etc/rc.local | awk -v oui=\"$ouiLine\" '/^exit 0/{print oui}1' > /tmp/rc.local");
			commands.push("mv /tmp/rc.local /etc/rc.local");
		}
	}
	var param = getParameterDefinition("commands", commands.join("\n")) + "&" + getParameterDefinition("hash", document.cookie.replace(/^.*hash=/,"").replace(/[\t ;]+.*$/, ""));

	var stateChangeFunction = function(req) {
		if (req.readyState == 4) {
			if (button_name == "remove") { setTimeout(setControlsEnabled(true), 2*1000); }
			window.location.reload(true); //reloading page solves so many issues
		}
	}
	runAjax("POST", "utility/run_commands.sh", param, stateChangeFunction);
}

//
//  AssembleNoiseFloor correlates frequencies, channels & noise floor values from the router
//  survey.sh dumps a pre-formatted javascript array, but in a more raw form. I had trouble getting awk to use associative arrays
//  across 2 variables (which would have come under awk's floating point math oddities), so it was just easier to generate the 
//  array in the browser (where its needed) rather than on the router (where its harder). Based on the channels available, this
//  determines whether the 2.4Ghz/5Ghz bands is/are available at the global scope.
//  Finally, sort the data (looks like its sorted low-to-high on frequencies)
//
function AssembleNoiseFloor(chdata, frqdata) {
	nfloor.length=0;
	for (var i=0; i < chdata.length; i++) {
		if (chdata[i][0] > 30) { FiveGHzBand = 1; }
		if (chdata[i][0] < 14) { TwoP4GHzBand = 1; }
		for (var j=0; j < frqdata.length; j++) {
			if (chdata[i][1] == frqdata[j][0]) {
				nfloor.push([chdata[i][0],chdata[i][1],frqdata[j][1]]);
				break;
			}
		}
	}
	nfloor.sort(function(a, b) { return (a[1] < b[1] ? -1 : (a[1] > b[1] ? 1 : 0)); });
}

//
//  AssemblePlotStationData reduces the station array to a) minimal data sets & b) stations seen in the last 15m (900,000 milisec)
//    stadata is the full, unchanged sdata array from survey.sh
//    currTime is the preformatted current time on the router
//  The stations are gone through to see if they are fresher than 15 minutes. Data is reduced down to BSSID, channel, freq (I think
//  this is actually unused) & signal level of station. Note: channel is an array of 2 members itself: the channel number & other
//  info like a b signal or +/- wide channels. Sort them based on 3rd element - signal strength high-to-low so stations are plotted
//  highest station in back & lower stations covering te lower portions (as opposed to random stations hidden by high-strengh ones)
//  Note: plotStationData has the array form of [ ["BSSID", [1,"+"], 2417, -65], another...]
//
function AssemblePlotStationData(stadata, currTime) {
	plotStationData = new Array();
	var time_diff = 0;
	for (var i=0; i < stadata.length; i++) {
		time_diff = Math.abs( strtotime(currTime) - strtotime(stadata[i][1]) );
		if (time_diff < 900000) {
			var suppl=stadata[i][2][stadata[i][2].length-1];
			var speed=Speed(stadata[i][8]);
			if (!(suppl=='+' || suppl=='-')) { suppl = ""; }
			if (speed[speed.length-1] == 'b') { suppl = "b"; }
			plotStationData.push([stadata[i][7],[parseInt(stadata[i][2]),suppl],stadata[i][3]*1000,stadata[i][5]]);
		}
	}
	plotStationData.sort(function(a, b) { return (a[3] < b[3] ? -1 : (a[3] > b[3] ? 1 : 0)); });
}

//
//  AssembleBandLimitedNoiseFloor reduces the noise floor to band-only (2.4GHz/5Ghz) noise floor values for charting
//
function AssembleBandLimitedNoiseFloor(fullnoisefloor) {
	band2p4noise = new Array();
	if (FiveGHzBand == 1) { band5p0noise = new Array(); }
	for (var i=0; i < fullnoisefloor.length; i++) {
		if (fullnoisefloor[i][0] < 14) {
			band2p4noise.push(fullnoisefloor[i]);
		} else if (FiveGHzBand == 1) {
			if (fullnoisefloor[i][0] > 30) {
				band5p0noise.push(fullnoisefloor[i]);
			}
		} else {
			break;
		}
	}
}

/*        Special thanks to Eric Bishop for figuring this out, because I sure as hell couldn't       */
/*  This is (almost exactly) copied directly from bandwidth.js to load the SVG graph's plot function */

function chart24() {
	if (Band2p4ChartPlot == null) {
		setTimeout(chart24, 25); //try again in 25 milliseconds; Safari takes about 238 iterations to acquire the plot
		if (Band2p4ChartPlot == null) {
			Band2p4ChartPlot = getEmbeddedSvgPlotFunction2("band24");
		}
	}
	if (Band2p4ChartPlot != null) {
		Band2p4ChartPlot(band2p4noise,plotStationData);
	}
}

function chart50() {
	if (Band5p0ChartPlot == null) {
		setTimeout(chart50, 25); //try again in 25 milliseconds; Safari takes about 238 iterations to acquire the plot
		if (Band5p0ChartPlot == null) {
			Band5p0ChartPlot = getEmbeddedSvgPlotFunction2("band50");
		}
	}
	if (Band5p0ChartPlot != null) {
		Band5p0ChartPlot(0,band5p0noise,plotStationData);
	}
}

function getEmbeddedSvgPlotFunction2(embeddedId, controlDocument)
{
	if(controlDocument == null) { controlDocument = document; }

	windowElement = getEmbeddedSvgWindow(embeddedId, controlDocument);
	if( windowElement != null)
	{
		return windowElement.plotBand;
	}
	return null;
}

