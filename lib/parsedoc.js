#!/usr/bin/env node
// 
//        Copyright 2010 Johan Dahlberg. All rights reserved.
//
//  Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions
//  are met:
//
//    1. Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright 
//       notice, this list of conditions and the following disclaimer in the 
//       documentation and/or other materials provided with the distribution.
//
//  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
//  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
//  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
//  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
//  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

const print               = require("util").print
    , stat                = require("fs").statSync
    , readdir             = require("fs").readdirSync
    , readFile            = require("fs").readFile
    , open                = require("fs").openSync
    , close               = require("fs").closeSync
    , write               = require("fs").writeSync
    , basename            = require("path").basename
    , join                = require("path").join

const VERSION             = "0.9.0";
const USAGE               = "Usage: parsedoc.js [options] filepath or dirpath";

const HELP                = USAGE + "\n" + "\
Options:                                                                 \n\
  -h, --help                Show this help                               \n\
  -v, --version             Shows current version                        \n\
  -r, --recursive           Recursive-mode. Selects all test in dirpath  \n\
                            and its subdirectories.                      \n\
    , --output-file PATH    Send's parsed data to specified file, instead\n\
                            of stdout.                                   \n\
    , --output-dir PATH     Send's parsed data into specified dir,       \n\
                            instead of stdout. Create one file for each  \n\
                            output file.                                 \n\
    , --indent-offset NO    Set a fixed indent-offset, instead of        \n\
                            using auto-detection.                        \n\
    , --usage               Show usage for command                       \n";
    
    
const ARG_OPTIONS         = [ "--output-file", "--output-dir"
                            , "--indent-offset"];

/**
 *  parsedoc
 *  ========
 *
 *  **Parsedoc** is docstring extractor written for Node.js. The module can 
 *  be imported to existing projects or run as a stand-alone command-line 
 *  utility.
 *
 *  Quick example (using the comamnd-line utility):
 *
 *      parsedoc.js -r lib > docs/api.md
 *
 *  
 *  The example above extracts all docstring comments from parsedoc.js and 
 *  pipes them to a new file called `docs/api.md`.
 *    
 */
function main() {
  var args = process.argv.slice(2);
  var arg = null;
  var paths = [];
  var files = [];
  var opts = {};
  var outputfd;
  
  while ((arg = args.shift())) {
    if (arg.substr(0, 2) == "--") {
      if (ARG_OPTIONS.indexOf(arg) !== -1) {
        opts[arg.substr(2)] = args.shift();
      } else {
        opts[arg.substr(2)] = true;
      }
    } else if (arg[0] == "-") {
      opts[arg.substr(1)] = true;
    } else {
      /^(\/|\~|\.)/.test(arg) ? paths.push(arg) : 
                                paths.push(process.cwd() + '/' + arg);
    }
  }
  
  if (!opts.r) {
    opts.r = opts.recursive;
  }

  if (opts.help || opts.h) {
    console.log(HELP);
    return;
  }
  
  if (opts.version || opts.v) {
    console.log(VERSION);
    return;
  }
  
  if (("output-file" in opts) && ("output-dir" in opts)) {
    console.log("Do not combind --output-file and --output-dir");
    process.exit(1);
    return;
  }
  
  paths.forEach(function(path) {
    stat(path).isDirectory() && (files = files.concat(files(path, opts.r)));
    stat(path).isFile() && files.push(path);
  });

  if (!files.length || opts.usage) {
    console.log(USAGE);
    return;
  }
  
  if ("output-file" in opts) {
    outputfd = open(opts["output-file"], "w");
  }
  
  function parseFiles(err, data) {
    var path;
    
    if (err) {
      console.log(err);
      process.exit(1);
      return;
    }
    
    if (data) {
      
      // Write to output file instead of stdout.
      if (outputfd) {
        write(outputfd, data);
      } else {
        print(data);
      }
    }  
    
    if ((path = files.shift())) {
      exports.parseFile(path, opts.encoding || "utf8", opts, parseFiles);
    } else {
      if (outputfd) {
        close(outputfd);
      }
    }
  }
  
  process.nextTick(parseFiles);
}

/**
 *  ### parseFile(path, [encoding='utf8'], [options={}], [callback])
 *
 *  Parses all doc-comments in specified ´'path´'.
 */
exports.parseFile = function(path, encoding, options, callback) {
  readFile(path, encoding, function(err, data) {
    if (err) {
      callback(err);
      return;
    }
    callback(null, exports.parse(data, options));
  });
}

/**
 *  ### parse(str, [options={}])
 *
 *  Parses all doc-comments in specified ´'str´'.
 */
exports.parse = function(str, opts) {
  var tokens = tokenize(str);
  var pos = 0;
  var length = tokens.length;
  var commentlevel = 0;
  var parsecomment = false;
  var instring = false;
  var dstring = false;
  var sstring = false;
  var result = [];
  var currrow = [];
  var token;
  
  while ((token = tokens.next())) {
    switch (token) {
      
      case '"':
        if (!sstring) {
          dstring = !dstring;
          instring = !instring;          
        }
        break;
      
      case "'":
        if (!dstring) {
          sstring = !sstring;
          instring = !instring;          
        }
        break;

      case "/**":
        if (instring) break;
        parsecomment = true;

      case "/*":
        if (instring) break;
        commentlevel++;
        break;
        
      case "*/":
        if (!instring && --commentlevel == 0) {
          parsecomment = false;
        }
        break;
        
      case "\n":
        if (parsecomment) {
          result.push(endrow(currrow.join("")));
          currrow = [];
        }
        break;
        
      default:
        if (parsecomment) {
          currrow.push(token);
        }
        break;
    }
  }
  
  if (currrow.length) {
    result.push(endrow(currrow.join("")), opts);
  }

  return trim(result, opts);
}

// Removes leading * from row.
function endrow(row, opts) {
  var index;
  if ((index = row.indexOf("*")) != -1) {
    return row.substr(index + 1) + "\n";
  } else {
    return row + "\n";
  }
}

// Trim's the begining of line for each row.
function trim(rows, opts) {
  var trimoff = 0;
  var result;
  
  if ("indent-offset" in opts) {
    trimoff = parseInt(opts["indent-offset"]);
  } else {
    rows.forEach(function(row) {
      for (var i = 0; i < row.length; i++) {
        if (row[i] !== " " && row[i] !== "\n") {
          if (trimoff == 0 || i < trimoff) {
            trimoff = i;
          }
          break;
        }
      }
    });
  }

  result = rows.map(function(row) {
    if (typeof row !== "string") return "";
    if (row.length <= trimoff) {
      return row; 
    } else {
      return row.substr(trimoff);
    }
  });
  
  return result.join("");
}

// Tokenizes a string
function tokenize(str) {
  var pos = 0;
  var length = str.length;
  var tokens = [];
  var dstring = false;
  var sstring = false;
  
  for (; pos < length; pos++) {    
    switch (str[pos]) {
      case "/":
        if (str[pos + 1] == "*" && str[pos + 2] == "*") {
          tokens.push("/**");
          pos += 2;
        } else if (str[pos + 1] == "*") {
          tokens.push("/*");
          pos += 1;
        } else {
          tokens.push(str[pos]);
        }
        break;
      case "*":
        if (str[pos + 1] == "/") {
          tokens.push("*/");
          pos += 1;
        } else {
          tokens.push(str[pos]);
        }
        break;
      default:
        tokens.push(str[pos]);
        break;
    }
  }
  
  tokens.pos = 0;
  tokens.next = function() {
    return this[this.pos++];
  }
  
  return tokens;
}

// Sync. Get all tests objects form specified directory. The `r` argument 
// specifies recursive mode.
function files(dirpath, r) {
  var result = [];
  var paths = readdir(dirpath);
  
  paths.forEach(function(path) {
    var p = join(dirpath, path);
    stat(p).isDirectory() && r && (result = result.concat(files(p, r)));
    stat(p).isFile() && /^test/.test(basename(p)) && result.push(p);
  });
  
  return result;
}

// Run in exec mode if executed from 
// command line
process.argv[1] == __filename && main();