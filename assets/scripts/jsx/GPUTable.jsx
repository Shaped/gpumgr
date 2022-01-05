/* (C) 2022 Shaped Technologies | GPL v3 */

class GPUTableFactory {
	componentFactory() { 
		return (
			<GPUTable GPUs={gpumgr.data} />
		);
	}
}

class ProductLogo extends React.Component {
	constructor(props) {
		super(props);

	}

	render() {
		let type=null;

		this.props.ProductName.includes("GeForce")?type='GeForce':null;
		this.props.ProductName.includes("GTX")?type='GTX':null;
		this.props.ProductName.includes("Max-Q")?type='Max-Q':null; //*::TODO:: add TI, Super and a million other names?
		this.props.ProductName.includes("RTX")?type='RTX':null;
		this.props.ProductName.includes("Titan")?type='Titan':null;
		this.props.ProductName.includes("Titan RTX")?type='Titan RTX':null;
		this.props.ProductName.includes("Quadro")?type='Quadro':null;
		this.props.ProductName.includes("Quadro RTX")?type='Quadro RTX':null;
		this.props.ProductName.includes("Radeon")?type='Radeon':null;
		this.props.ProductName.includes("FirePro")?type='FirePro':null;
		this.props.ProductName.includes("Vega")?type='Vega':null;
		this.props.ProductName.includes("Iris")?type='Iris':null;
		this.props.ProductName.includes("Arc")?type='Arc':null;

		this.productImage = gpumgr.productTypeImages.find(
			(v) => { if (v.type == type) return true; }
		);

		console.log(type);

		if (type != null) {
			return (<img className="productTypeImage" src={"/img/vendor/"+this.productImage.image} />);
		} else {
			return null;
		}
	}
}

class GPUTable extends React.Component {
	componentDidMount() {
		window.dispatchEvent(
			new CustomEvent('sortableComponentMounted',
				{ detail: { component: this.__proto__.constructor.name } })
		);
	}

	render() {
		let NoGPUs = (<>
				<h2>No GPUs were found!</h2>
				<p>You can check the gpumgr log for hints, also check that your GPU drivers are correctly installed.</p>
				<p>gpumgr shouldn't need special permission to list GPUs, however, it will need <em>root</em> access to modify any settings.</p>
			</>);

		let GPUTable = (<>
			<h2>GPUs Found:</h2>
			<table className="sortable gpuTable">
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
					{Array.from(this.props.GPUs).map((gpu,i) => {
						return (
						<tr key={i}>
							<td>{gpu.gpu}</td>
							<td className="vendor">
						      {(() => {
						        if (gpu.vendorName != "unknown") {
									return (<img className="vendorLogo" src={"/img/vendor/" + gpu.vendorName + "-logo-sq.png"} />);
						        } else {
						        	return "Unknown";
						        }
						      })()}							
							</td>
							<td>{gpu.pcidevice}</td>
							<td>{gpu.vendorid}:{gpu.deviceid}</td>
							<td>{gpu.subvendorid}:{gpu.subdeviceid}</td>
							<td><ProductLogo ProductName={gpu.productName} />{gpu.productName}</td>
						</tr>
						);
					})}
				</tbody>
			</table>
			</>);

		return (<>
				{this.props.GPUs
					?	GPUTable
					:   NoGPUs
				}
			</>);
	}
}