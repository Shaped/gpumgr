class MainComponent extends React.Component {
	constructor(props){
		super(props);
		this.state={
			GPUs:props.GPUs,
			children:[]
		};
		
	
	}
	addChild(child) {
		child.ref = React.createRef();
		child.props = this.state;
		this.setState({
		  GPUs: this.state.GPUs,
		  children: [...this.state.children, child],
		});
	}
	update(GPUs) {
		this.setState({
		  GPUs,
		  children: [...this.state.children],
		});
	}
	render() {
		let possibleChildren = { CardWrapper };
		let children=[];
		this.state.children.map((child,i) => {
			if (typeof possibleChildren[child.componentName] === 'undefined')
				throw new Error("Component not whitelisted")
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i, ...child.props}));
		});
		return children;
	}
}