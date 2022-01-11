class Card extends React.Component {
	constructor(props){
		super(props);
		this.state={children:[]};
	}	
	addChild(child) {
		let children=[];		console.log('card:addch')
		child.ref = React.createRef();
		console.log(child)
		this.setState({
		  children: [...this.state.children, child],
		});
	}	
	render() {
		let possibleChildren = { GPUTable };
		let children=[];
		this.state.children.map((child,i) => {
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i, ...child.props}));
		});
		return (
			<div className="card">
				{children}
			</div>
			);
	}
}