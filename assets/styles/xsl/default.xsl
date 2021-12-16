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
<!-- Bindings; Requried for freeform-js (because saxon), not required for freeform-php (because not saxon) -->
<xsl:param name="pageTitle" as="array(*)"/>
<xsl:param name="metaDescription" as="array(*)"/>
<xsl:param name="revisitAfter" as="array(*)"/>
<xsl:param name="currentYear" as="array(*)"/>
<xsl:template 
	name="default"
	match="/">

<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
	<link rel="manifest" href="/app.webmanifest" />
	<link rel="stylesheet" type="text/css" href="css/default.css" />

	<title><xsl:value-of select="$pageTitle" /></title>

	<meta charset="utf-8" />
	<meta content-type="application/xhtml+xml" />
	<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />

	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="description" content="{$metaDescription}" />
	<meta name="revisit-after" content="{$revisitAfter}" />

	<script type="text/javascript" src="js/app.js"></script>
</head>

<body>
<header>
	<div class="logo">
		<img src="/img/gpumgr-logo.png" />
		<div class="logoText">
			<span class="logoText">gpumgr<small>.js</small></span>
			<span class="sloganText">Linux GPU Management Tool</span>
		</div>
	</div>
	<div class="right">
		
	</div>
</header>
<main>
	<div class="cardWrapper">
		<div class="card wide">
			<xsl:choose>
				<xsl:when test="GPUs/*">
					<h2>GPUs Found:</h2>
					<table class="gpuTable">
						<thead>
							<tr>
								<td>ID</td>
								<td>Vendor</td>
								<td>PCI Bus ID</td>
								<td>VendorID:DeviceID</td>
								<td>SubVendorID:SubDeviceID</td>
								<td>Name</td>
							</tr>
						</thead>
						<tbody>
							<xsl:for-each select="GPUs/*">
								<tr>
									<td><xsl:value-of select="gpu/@gpu" /></td>
									<td><xsl:value-of select="gpu/@vendorName" /></td>
									<td><xsl:value-of select="gpu/@pcidevice" /></td>
									<td><xsl:value-of select="gpu/@vendorid" />:<xsl:value-of select="gpu/@deviceid" /></td>
									<td><xsl:value-of select="gpu/@subvendorid" />:<xsl:value-of select="gpu/@subdeviceid" /></td>
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
			</xsl:choose>
		</div>
	</div>
</main>
<footer>
	<span><a href="https://github.com/Shaped/gpumgr/">gpumgr</a>&#0160;-&#0160;<a href="https://github.com/Shaped/">(C)&#0160;<xsl:value-of select="$currentYear" />&#0160;Shaped&#0160;Technologies</a></span>
</footer>
</body>
</html>
</xsl:template>
</xsl:stylesheet>