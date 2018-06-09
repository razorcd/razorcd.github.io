  var emParts= ["com", "cris", "tian", "con", "tact", "raz", "orcodes"];
  var hrefParts= ["mai", "contact", "lto:"];
  var emText= emParts[1]+ emParts[2]+"@"+emParts[5]+emParts[6]+"."+emParts[0];
  var emElem= document.getElementById("em-obf");
  emElem.innerHTML= emText;
  emElem.setAttribute("href", hrefParts[0]+hrefParts[2]+emText);
  // var emHrefElem2= document.getElementById("em-obf-href2"); //changes only the href
  // emHrefElem2.setAttribute("href", hrefParts[0]+hrefParts[2]+emText);
  // emHrefElem2.setAttribute("title", emText);
  // var emHrefElem= document.getElementById("em-obf-href"); //changes only the href
  // emHrefElem.setAttribute("href", hrefParts[0]+hrefParts[2]+emText);
  // emHrefElem.setAttribute("title", emText);