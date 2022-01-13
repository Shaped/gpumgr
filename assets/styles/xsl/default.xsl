<?xml version="1.0" encoding="utf-8" ?>
<xsl:stylesheet
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:freeform="http://www.shaped.ca/freeform"
	version="1.0">

<xsl:output
	method="xml"
	indent="yes"
	encoding="utf-8"
/>
<!-- Bindings; Requried for freeform-js (because saxon, stupid, wtf, can we fix? maybe even just stuff these in manually? like ef, we can't even use any other binding types it seems), not required for freeform-php (because not saxon) -->
<xsl:param name="pageTitle" as="array(*)"/>
<xsl:param name="metaDescription" as="array(*)"/>
<xsl:param name="revisitAfter" as="array(*)"/>
<xsl:param name="currentYear" as="array(*)"/>
<xsl:param name="version" as="array(*)"/>
<xsl:param name="serviceHost" as="array(*)"/>
<xsl:param name="servicePort" as="array(*)"/>
<xsl:param name="data" as="array(*)"/>
<xsl:param name="stats" as="array(*)"/>

<xsl:template 
	name="default"
	match="/">

<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
	<link rel="manifest" href="/app.webmanifest" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />

	<link id="csstheme" rel="stylesheet" type="text/css" href="css/default-dark.css" />

	<title><xsl:value-of select="$pageTitle" /></title>

	<meta charset="utf-8" />
	<meta content-type="application/xhtml+xml" />
	<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />

	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="description" content="{$metaDescription}" />
	<meta name="revisit-after" content="{$revisitAfter}" />

	<!--*::DEVELOPMENT::* -->
	<script type="text/javascript" src="js/react/react.development.js"></script>
	<script type="text/javascript" src="js/react/react-dom.development.js"></script>

	<!--*::PRODUCTION::* 
	<script type="text/javascript" src="js/react/react.production.min.js"></script>
	<script type="text/javascript" src="js/react/react-dom.production.min.js"></script> -->

	<script type="text/javascript">var _data = `<xsl:value-of select="$data" />`;</script>
	<script type="text/javascript">var _stats = `<xsl:value-of select="$stats" />`;</script>
	<script type="text/javascript">var _servicePort = `<xsl:value-of select="$servicePort" />`;</script>
	<script type="text/javascript">var _serviceHost = `<xsl:value-of select="$serviceHost" />`;</script>

	<script type="text/javascript" src="js/ReactComponents.jsx"></script>
	
	<script type="text/javascript" src="js/sortable/sortable.js"></script>

	<script type="text/javascript" src="js/webSocketHandler.js"></script>
	<script type="text/javascript" src="js/app.js"></script>
</head>

<body>
<header>
	<div class="logo">
		<div class="logoText menu_toggle">
			<span class="logoText">gpumgr<small>.js</small></span>
			<span class="sloganText">Linux GPU Management Tool</span>
		</div>
	</div>
	<div class="right">
		<div>
			<select id="csstheme_selector">
				<option disabled="disabled">Select Theme</option>
				<option disabled="disabled">---</option>
				<option value="default-dark" selected="selected">Default (dark)</option>
				<option value="default">Default (light)</option>
			</select>
		</div>
		<p alt="This should be 127.0.0.1 unless you need to access gpumgr from a remote system!">Listening on http://<xsl:value-of select="$serviceHost" />:<xsl:value-of select="$servicePort" /></p>
	</div>
</header>
<nav>
	<div class="logoImage menu_toggle">
		<img src="/img/gpumgr-logo.png" />
	</div>
	<menu>
		<li id="menu_dashboard" class="active">Dashboard</li>
		<li id="menu_details">GPU&#0160;Details</li>
		<li id="menu_management">Management</li>
		<li id="menu_monitoring">Monitoring</li>
		<li id="menu_preferences">Preferences</li>
	</menu>
</nav>
<main id="mainContentArea">
	<div class="cardWrapper">
		<div class="card wide" id="card-GPUTable">
			<!--<xsl:choose>
				<xsl:when test="GPUs/*">
					<h2>GPUs Found:</h2>
					<table class="gpuTable">
						<thead>
							<tr>
								<td>ID</td>
								<td>Vendor</td>
								<td>PCI Bus ID</td>
								<td>VendorID:DeviceID<br/>SubVendorID:SubDeviceID</td>
								<td>Type</td>
								<td>Device Name</td>
							</tr>
						</thead>
						<tbody>
							<xsl:for-each select="GPUs/*">
								<tr>
									<td><xsl:value-of select="gpu/@gpu" /></td>
									<td>
										<xsl:choose>
											<xsl:when test="gpu/@vendorName != 'unknown'">
												<img class="vendorLogo" src="/img/vendor/{gpu/@vendorName}-logo-sq.png" />
											</xsl:when>
											<xsl:otherwise>
												<xsl:value-of select="gpu/@vendorName" />
											</xsl:otherwise>
										</xsl:choose>
									</td>
									<td><xsl:value-of select="gpu/@pcidevice" /></td>
									<td><xsl:value-of select="gpu/@vendorid" />:<xsl:value-of select="gpu/@deviceid" /><br /><xsl:value-of select="gpu/@subvendorid" />:<xsl:value-of select="gpu/@subdeviceid" /></td>
									<td></td>
									<td><xsl:value-of select="gpu/@productName" /></td>
								</tr>
							</xsl:for-each>
						</tbody>
					</table>
				</xsl:when>
				<xsl:otherwise>
					<h2>No GPUs were found!</h2>
					<p>You can check the gpumgr log for hints, also check that your GPU drivers are correctly installed.</p>
					<p>gpumgr shouldn't need special permission to list GPUs, however, it will need <em>root</em> access to modify any settings.</p>
				</xsl:otherwise>
			</xsl:choose>-->Loading ...
		</div>
	</div>
</main>
<footer>
	<span><a href="https://github.com/Shaped/gpumgr/">gpumgr.js</a>&#0160;v<xsl:value-of select="$version" />&#0160;<a href="https://github.com/Shaped/">&#x24B8;&#0160;<xsl:value-of select="$currentYear" />&#0160;Shaped</a></span>
</footer>
</body>
</html>
</xsl:template>
</xsl:stylesheet>